import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { BrevoService } from '../notifications/brevo.service';
import { InviteTeamMemberDto, UpdateMemberStatusDto } from './dto/invite-team-member.dto';
import { Role, normalizeRole } from '../../common/enums/role.enum';
import * as crypto from 'crypto';

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly brevoService: BrevoService
  ) {}

  /**
   * List all internal company team members (Owner, Admin, Manager, Operator/Supervisor)
   */
  async getTeamMembers(companyId: string) {
    const company = await this.db.findCompanyById(companyId);
    if (!company) {
      throw new NotFoundException(`Company '${companyId}' not found.`);
    }

    // 1. Fetch company memberships with hydrated user profiles in a single query
    const allMembers = await this.db.findMembersByCompanyId(companyId);
    
    // Filter to internal management team only (exclude employees per Spec Section 14)
    const hydrated = allMembers
      .filter((m) => normalizeRole(m.role) !== Role.Employee)
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user ? `${m.user.firstName} ${m.user.lastName}`.trim() : 'Unknown User',
        email: m.user?.email || '',
        phone: m.user?.phone || null,
        role: m.role,
        status: m.status,
        joinedAt: m.createdAt,
      }));

    // 3. Fetch pending invitations for team members
    const allInvitations = await this.db.findInvitationsByCompany(companyId);
    const pendingInvitations = allInvitations
      .filter((inv) => inv.targetType === 'team_member' && inv.status === 'pending')
      .map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      }));

    return {
      members: hydrated,
      pendingInvitations,
    };
  }

  /**
   * Owner invites a new internal management team member (Manager or Operator)
   */
  async inviteTeamMember(
    companyId: string,
    actorId: string,
    actorRole: string,
    dto: InviteTeamMemberDto
  ) {
    const normalizedRole = normalizeRole(dto.role);

    // Spec Section 14: Only Owner can manage/invite Team Members
    if (normalizeRole(actorRole) !== Role.Owner && normalizeRole(actorRole) !== Role.Admin) {
      throw new ForbiddenException('Only the Company Owner can invite internal team members.');
    }

    if (normalizedRole === Role.Employee) {
      throw new BadRequestException('Use the Employee onboarding wizard to create employees.');
    }

    const company = await this.db.findCompanyById(companyId);
    if (!company) {
      throw new NotFoundException(`Company '${companyId}' not found.`);
    }

    const email = dto.email.toLowerCase().trim();

    // Check if user already has an active membership in this company
    const existingUser = await this.db.findUserByEmail(email);
    if (existingUser) {
      const existingMembership = await this.db.findCompanyMember(companyId, existingUser.id);
      if (existingMembership) {
        throw new ConflictException(
          `User '${email}' is already an active member of this company with role ${existingMembership.role}.`
        );
      }
    }

    // Check if a pending invitation already exists for this email in this company
    const companyInvitations = await this.db.findInvitationsByCompany(companyId);
    const activeInvite = companyInvitations.find(
      (inv) => inv.email.toLowerCase() === email && inv.status === 'pending'
    );
    if (activeInvite) {
      throw new ConflictException(
        `A pending invitation already exists for '${email}'. You can resend the existing invitation.`
      );
    }

    // Generate 32-byte cryptographically secure random token (Section 11)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours validity

    const invitation = await this.db.createInvitation({
      companyId,
      email,
      role: dto.role,
      targetType: 'team_member',
      tokenHash,
      status: 'pending',
      expiresAt,
      invitedBy: actorId,
    });

    // Send invitation email via Brevo transactional pipeline
    await this.brevoService.sendInvitationEmail({
      to: email,
      recipientName: dto.name,
      companyName: company.name,
      role: dto.role,
      activationToken: rawToken,
      expiresHours: 72,
    });

    // Record audit log entry
    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'TEAM_MEMBER_INVITED',
      entity: 'invitations',
      entityId: invitation.id,
      newValue: {
        email,
        role: dto.role,
      },
    });

    return {
      message: `Invitation successfully dispatched to ${email}`,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    };
  }

  /**
   * Resend an existing pending invitation
   */
  async resendInvitation(companyId: string, actorId: string, invitationId: string) {
    const invitations = await this.db.findInvitationsByCompany(companyId);
    const invite = invitations.find((i) => i.id === invitationId);

    if (!invite || invite.companyId !== companyId) {
      throw new NotFoundException(`Invitation '${invitationId}' not found.`);
    }

    if (invite.status !== 'pending') {
      throw new BadRequestException(`Cannot resend an invitation with status '${invite.status}'.`);
    }

    const company = await this.db.findCompanyById(companyId);

    // Refresh token and expiration
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await this.db.updateInvitationStatus(invite.id, 'pending');

    await this.brevoService.sendInvitationEmail({
      to: invite.email,
      companyName: company ? company.name : 'Workforce Platform',
      role: invite.role,
      activationToken: rawToken,
      expiresHours: 72,
    });

    return { message: `Invitation resent to ${invite.email}` };
  }

  /**
   * Revoke a pending invitation
   */
  async revokeInvitation(companyId: string, actorId: string, invitationId: string) {
    const invitations = await this.db.findInvitationsByCompany(companyId);
    const invite = invitations.find((i) => i.id === invitationId);

    if (!invite || invite.companyId !== companyId) {
      throw new NotFoundException(`Invitation '${invitationId}' not found.`);
    }

    await this.db.updateInvitationStatus(invitationId, 'cancelled');

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'INVITATION_REVOKED',
      entity: 'invitations',
      entityId: invitationId,
    });

    return { message: 'Invitation has been revoked.' };
  }

  /**
   * Update status of an active team member (e.g. suspend / reactivate)
   */
  async updateMemberStatus(
    companyId: string,
    actorId: string,
    actorRole: string,
    memberId: string,
    dto: UpdateMemberStatusDto
  ) {
    if (normalizeRole(actorRole) !== Role.Owner && normalizeRole(actorRole) !== Role.Admin) {
      throw new ForbiddenException('Only the Company Owner can change team member access.');
    }

    const members = await this.db.findMembersByCompanyId(companyId);
    const targetMember = members.find((m) => m.id === memberId);

    if (!targetMember || targetMember.companyId !== companyId) {
      throw new NotFoundException(`Team member '${memberId}' not found.`);
    }

    // Owner protection: cannot suspend account owner
    if (normalizeRole(targetMember.role) === Role.Owner) {
      throw new BadRequestException('The Company Owner account status cannot be modified.');
    }

    await this.db.updateCompanyMemberStatus(companyId, memberId, dto.status);

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'TEAM_MEMBER_STATUS_CHANGED',
      entity: 'company_members',
      entityId: memberId,
      oldValue: { status: targetMember.status },
      newValue: { status: dto.status },
    });

    return { message: `Member status successfully updated to '${dto.status}'.` };
  }
}
