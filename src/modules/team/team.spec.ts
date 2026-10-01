import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TeamService } from './team.service';
import { DatabaseModule } from '../../database/database.module';
import { DatabaseService } from '../../database/database.service';
import { BrevoService } from '../notifications/brevo.service';
import { AuthService } from '../auth/auth.service';
import { Role } from '../../common/enums/role.enum';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('TeamService & Invitation Flow', () => {
  let teamService: TeamService;
  let authService: AuthService;
  let db: DatabaseService;

  let testCompanyId: string;
  let ownerUserId: string;

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: any) => {
      const configMap: Record<string, any> = {
        'jwt.secret': 'test_jwt_secret_for_unit_tests_32_characters_long',
        'jwt.expiresIn': '15m',
        'jwt.refreshExpiresIn': '7d',
        'brevo.appUrl': 'http://localhost:3000',
      };
      return configMap[key] ?? defaultVal;
    }),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('jwt_mock_token_xyz_12345'),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [
        TeamService,
        AuthService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: BrevoService,
          useValue: {
            sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
            sendShiftAssignedEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    teamService = module.get<TeamService>(TeamService);
    authService = module.get<AuthService>(AuthService);
    db = module.get<DatabaseService>(DatabaseService);

    // Setup initial test company
    const comp = await db.createCompany({
      name: 'Apex Guarding UK',
      slug: `apex-guarding-${Date.now()}`,
      status: 'active',
      subscriptionTier: 'pro',
    });
    testCompanyId = comp.id;

    const owner = await db.createUser({
      email: 'owner@apexguarding.co.uk',
      passwordHash: 'hashed_pw',
      firstName: 'Arthur',
      lastName: 'Pendelton',
      isActive: true,
    });
    ownerUserId = owner.id;

    await db.createCompanyMember({
      companyId: testCompanyId,
      userId: owner.id,
      role: Role.Owner,
      status: 'active',
    });
  });

  it('1. Owner should be able to invite a Manager via Brevo', async () => {
    const res = await teamService.inviteTeamMember(testCompanyId, ownerUserId, Role.Owner, {
      email: 'manager@apexguarding.co.uk',
      role: Role.Manager,
      name: 'Jane Manager',
    });

    expect(res.invitation).toBeDefined();
    expect(res.invitation.email).toBe('manager@apexguarding.co.uk');
    expect(res.invitation.role).toBe(Role.Manager);
    expect(res.invitation.status).toBe('pending');
  });

  it('2. Manager should NOT be allowed to invite another Manager (Owner only)', async () => {
    await expect(
      teamService.inviteTeamMember(testCompanyId, 'usr-some-manager', Role.Manager, {
        email: 'another@apexguarding.co.uk',
        role: Role.Manager,
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it('3. Duplicate pending invitation should be rejected', async () => {
    await expect(
      teamService.inviteTeamMember(testCompanyId, ownerUserId, Role.Owner, {
        email: 'manager@apexguarding.co.uk',
        role: Role.Manager,
      })
    ).rejects.toThrow(ConflictException);
  });

  it('4. Listing team members should exclude normal employees', async () => {
    // Create an employee member
    const empUser = await db.createUser({
      email: 'guard@apexguarding.co.uk',
      passwordHash: 'hashed_pw',
      firstName: 'Tom',
      lastName: 'Hardy',
      isActive: true,
    });
    await db.createCompanyMember({
      companyId: testCompanyId,
      userId: empUser.id,
      role: Role.Employee,
      status: 'active',
    });

    const list = await teamService.getTeamMembers(testCompanyId);
    expect(list.members.length).toBeGreaterThan(0);
    // Ensure employee is not in management team list
    const hasEmployee = list.members.some((m) => m.email === 'guard@apexguarding.co.uk');
    expect(hasEmployee).toBe(false);

    // Pending invitations should list the manager invite
    expect(list.pendingInvitations.length).toBeGreaterThan(0);
    expect(list.pendingInvitations.some((i) => i.email === 'manager@apexguarding.co.uk')).toBe(true);
  });

  it('5. Inviting Operator should succeed and be activatable via token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await db.createInvitation({
      companyId: testCompanyId,
      email: 'operator@apexguarding.co.uk',
      role: Role.Supervisor, // Operator
      targetType: 'team_member',
      tokenHash,
      status: 'pending',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour future
      invitedBy: ownerUserId,
    });

    // Public details query
    const details = await authService.getInvitationDetails(rawToken);
    expect(details.email).toBe('operator@apexguarding.co.uk');
    expect(details.role).toBe(Role.Supervisor);

    // Public activation
    const activationRes = await authService.activateInvitation({
      token: rawToken,
      firstName: 'Sam',
      lastName: 'Operator',
      password: 'StrongPassword123!',
      phone: '+44 7911 123456',
    });

    expect(activationRes.accessToken).toBeDefined();
    expect(activationRes.user.email).toBe('operator@apexguarding.co.uk');
    expect(activationRes.company.role).toBe(Role.Supervisor);

    // Ensure invitation is now marked accepted (single-use)
    const after = await db.findInvitationByTokenHash(tokenHash);
    expect(after?.status).toBe('accepted');

    // Attempting to reuse the same token should fail
    await expect(
      authService.activateInvitation({
        token: rawToken,
        firstName: 'Sam',
        lastName: 'Operator',
        password: 'StrongPassword123!',
      })
    ).rejects.toThrow();
  });
});
