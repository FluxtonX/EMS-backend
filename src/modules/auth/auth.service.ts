import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ActivateInvitationDto } from './dto/activate-invitation.dto';
import { Role } from '../../common/enums/role.enum';
import { getPermissionsForRole } from '../../common/enums/permission.enum';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private db: DatabaseService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.db.findUserByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('An account with this email address already exists.');
    }

    // Slug generation from company name
    const baseSlug = dto.companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    const slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;

    // Hash password with bcrypt (10 rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // Atomically create Company
    const company = await this.db.createCompany({
      name: dto.companyName.trim(),
      slug,
      status: 'active',
      subscriptionTier: 'standard',
    });

    // Create User
    const user = await this.db.createUser({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      phone: dto.phone,
      isActive: true,
    });

    // Create Company Member as Owner
    const membership = await this.db.createCompanyMember({
      companyId: company.id,
      userId: user.id,
      role: Role.Owner,
      status: 'active',
    });

    // Audit log
    await this.db.recordAudit({
      companyId: company.id,
      userId: user.id,
      action: 'COMPANY_REGISTERED',
      entity: 'companies',
      entityId: company.id,
      newValue: { companyName: company.name, ownerEmail: user.email },
    });

    const tokens = await this.generateTokens(user.id, user.email, company.id, membership.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        role: membership.role,
      },
      permissions: getPermissionsForRole(membership.role),
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.db.findUserByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password credentials.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account has been deactivated. Contact your administrator.');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password credentials.');
    }

    // Retrieve active company memberships
    const memberships = await this.db.findMembershipsByUserId(user.id);
    if (memberships.length === 0) {
      throw new UnauthorizedException('No active company memberships found for this account.');
    }

    // Select primary membership (first active)
    const primaryMembership = memberships[0];
    const company = await this.db.findCompanyById(primaryMembership.companyId);
    if (!company || company.status !== 'active') {
      throw new UnauthorizedException('Associated company workspace is inactive or suspended.');
    }

    await this.db.recordAudit({
      companyId: company.id,
      userId: user.id,
      action: 'USER_LOGIN',
      entity: 'users',
      entityId: user.id,
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      company.id,
      primaryMembership.role
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        role: primaryMembership.role,
      },
      permissions: getPermissionsForRole(primaryMembership.role),
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>(
          'jwt.secret',
          'production_grade_secret_key_minimum_32_characters_for_hmac_sha256'
        ),
      });

      const user = await this.db.findUserById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token.');
      }

      const membership = await this.db.findCompanyMember(payload.companyId, user.id);
      if (!membership || membership.status !== 'active') {
        throw new UnauthorizedException('Membership expired or revoked.');
      }

      return this.generateTokens(user.id, user.email, payload.companyId, membership.role);
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
  }

  async getProfile(userId: string, companyId: string) {
    const user = await this.db.findUserById(userId);
    if (!user) throw new NotFoundException('User not found.');

    const company = await this.db.findCompanyById(companyId);
    if (!company) throw new NotFoundException('Company not found.');

    const membership = await this.db.findCompanyMember(companyId, userId);
    if (!membership) throw new UnauthorizedException('Membership not found.');

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        tier: company.subscriptionTier,
        role: membership.role,
      },
      permissions: getPermissionsForRole(membership.role),
    };
  }

  /**
   * Public endpoint to fetch invitation metadata by raw token
   */
  async getInvitationDetails(token: string) {
    if (!token) {
      throw new BadRequestException('Token query parameter is required.');
    }
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const invitation = await this.db.findInvitationByTokenHash(tokenHash);

    if (!invitation) {
      throw new NotFoundException('Invalid or expired invitation link.');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException(`This invitation has already been ${invitation.status}.`);
    }

    if (new Date().getTime() > new Date(invitation.expiresAt).getTime()) {
      await this.db.updateInvitationStatus(invitation.id, 'expired');
      throw new BadRequestException('This invitation link has expired. Please request a new one.');
    }

    const company = await this.db.findCompanyById(invitation.companyId);

    return {
      email: invitation.email,
      role: invitation.role,
      targetType: invitation.targetType,
      companyName: company ? company.name : 'Workforce Company',
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Public endpoint: User activates account via token, sets password, and logs in
   */
  async activateInvitation(dto: ActivateInvitationDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token.trim()).digest('hex');
    const invitation = await this.db.findInvitationByTokenHash(tokenHash);

    if (!invitation) {
      throw new NotFoundException('Invalid or expired invitation link.');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException(`This invitation has already been ${invitation.status}.`);
    }

    if (new Date().getTime() > new Date(invitation.expiresAt).getTime()) {
      await this.db.updateInvitationStatus(invitation.id, 'expired');
      throw new BadRequestException('This invitation link has expired. Please request a new one.');
    }

    const company = await this.db.findCompanyById(invitation.companyId);
    if (!company) {
      throw new NotFoundException('Associated company workspace not found.');
    }

    // 1. Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // 2. Find or create User entity
    let user = await this.db.findUserByEmail(invitation.email);
    if (user) {
      user.passwordHash = passwordHash;
      user.firstName = dto.firstName.trim();
      user.lastName = dto.lastName.trim();
      if (dto.phone) user.phone = dto.phone.trim();
      user.isActive = true;
      user.updatedAt = new Date();

      if (this.db.supabase) {
        await this.db.supabase
          .from('users')
          .update({
            password_hash: passwordHash,
            first_name: user.firstName,
            last_name: user.lastName,
            phone: user.phone,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      }
    } else {
      user = await this.db.createUser({
        email: invitation.email,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim(),
        isActive: true,
      });
    }

    // 3. Create or update company membership
    let membership = await this.db.findCompanyMember(invitation.companyId, user.id);
    if (membership) {
      membership.role = invitation.role as Role;
      membership.status = 'active';
      await this.db.updateCompanyMemberStatus(invitation.companyId, membership.id, 'active');
    } else {
      membership = await this.db.createCompanyMember({
        companyId: invitation.companyId,
        userId: user.id,
        role: invitation.role as Role,
        status: 'active',
      });
    }

    // 4. If target is employee, link employee record and set active account status
    if (invitation.targetType === 'employee' && invitation.targetId) {
      await this.db.updateEmployee(invitation.companyId, invitation.targetId, {
        userId: user.id,
        accountStatus: 'active',
      });
    } else if (invitation.targetType === 'employee') {
      const employees = await this.db.findEmployees(invitation.companyId, { search: invitation.email });
      const emp = employees.items.find((e) => e.email.toLowerCase() === invitation.email.toLowerCase());
      if (emp) {
        await this.db.updateEmployee(invitation.companyId, emp.id, {
          userId: user.id,
          accountStatus: 'active',
        });
      }
    }

    // 5. Invalidate invitation token (single-use)
    await this.db.updateInvitationStatus(invitation.id, 'accepted', new Date());

    // 6. Record audit log
    await this.db.recordAudit({
      companyId: invitation.companyId,
      userId: user.id,
      action: 'INVITATION_ACCEPTED',
      entity: 'invitations',
      entityId: invitation.id,
      newValue: {
        email: user.email,
        role: invitation.role,
        targetType: invitation.targetType,
      },
    });

    // 7. Generate authenticated tokens
    const tokens = await this.generateTokens(user.id, user.email, company.id, membership.role);

    return {
      message: 'Account successfully activated.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        role: membership.role,
      },
      permissions: getPermissionsForRole(membership.role),
      ...tokens,
    };
  }

  private async generateTokens(userId: string, email: string, companyId: string, role: Role) {
    const payload: JwtPayload = { sub: userId, email, companyId, role };

    const secret = this.configService.get<string>(
      'jwt.secret',
      'production_grade_secret_key_minimum_32_characters_for_hmac_sha256'
    );
    const expiresIn = this.configService.get<string>('jwt.expiresIn', '15m');
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { secret, expiresIn: expiresIn as any }),
      this.jwtService.signAsync(payload, { secret, expiresIn: refreshExpiresIn as any }),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
    };
  }
}
