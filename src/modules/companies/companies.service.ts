import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../../database/database.service';
import { AddMemberDto } from './dto/add-member.dto';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class CompaniesService {
  constructor(private db: DatabaseService) {}

  async getCurrentCompany(companyId: string) {
    const company = await this.db.findCompanyById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    return company;
  }

  async getMembers(companyId: string) {
    return this.db.findMembersByCompanyId(companyId);
  }

  async addMember(companyId: string, actorUserId: string, dto: AddMemberDto) {
    // Only Owners and Admins can add members
    const actorMembership = await this.db.findCompanyMember(companyId, actorUserId);
    if (!actorMembership || ![Role.Owner, Role.Admin].includes(actorMembership.role)) {
      throw new ForbiddenException('Only Owners and Admins can add members to the company.');
    }

    let user = await this.db.findUserByEmail(dto.email);
    if (!user) {
      // Create user with a secure temporary password
      const tempPassword = Math.random().toString(36).substring(2, 12) + '!9Aa';
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      user = await this.db.createUser({
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        isActive: true,
      });
    }

    const existingMember = await this.db.findCompanyMember(companyId, user.id);
    if (existingMember) {
      throw new ConflictException('User is already a member of this company.');
    }

    const membership = await this.db.createCompanyMember({
      companyId,
      userId: user.id,
      role: dto.role,
      status: 'active',
    });

    await this.db.recordAudit({
      companyId,
      userId: actorUserId,
      action: 'MEMBER_ADDED',
      entity: 'company_members',
      entityId: membership.id,
      newValue: { targetUserEmail: user.email, role: dto.role },
    });

    const { passwordHash, ...safeUser } = user;
    return {
      ...membership,
      user: safeUser,
    };
  }

  async getAuditLogs(companyId: string) {
    return this.db.getAuditLogs(companyId);
  }
}
