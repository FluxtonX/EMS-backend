import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { DatabaseModule } from '../../database/database.module';
import { DatabaseService } from '../../database/database.service';
import { Role } from '../../common/enums/role.enum';
import { ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

describe('Phase 1: Authentication + Company + RBAC Tests', () => {
  let authService: AuthService;
  let db: DatabaseService;
  let tenantGuard: TenantGuard;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: any) => {
      const configMap: Record<string, any> = {
        'jwt.secret': 'test_jwt_secret_for_unit_tests_32_characters_long',
        'jwt.expiresIn': '15m',
        'jwt.refreshExpiresIn': '7d',
        'database.supabaseUrl': 'https://placeholder.supabase.co',
        'database.supabaseKey': 'placeholder-key',
      };
      return configMap[key] ?? defaultVal;
    }),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('jwt_mock_token_xyz_12345'),
    verify: jest.fn().mockImplementation((token: string) => {
      if (token === 'valid_refresh_token') {
        return { sub: 'usr-1', email: 'owner@apex.co.uk', companyId: 'comp-1', role: Role.Owner };
      }
      throw new Error('Invalid token');
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [
        AuthService,
        TenantGuard,
        RolesGuard,
        Reflector,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    db = module.get<DatabaseService>(DatabaseService);
    tenantGuard = module.get<TenantGuard>(TenantGuard);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should successfully register a company and an owner user', async () => {
    const res = await authService.register({
      companyName: 'Apex Security Solutions',
      email: 'owner@apex-security.co.uk',
      password: 'SecurePassword123!',
      firstName: 'Arthur',
      lastName: 'Pendleton',
      phone: '+447000111222',
    });

    expect(res).toBeDefined();
    expect(res.user.email).toBe('owner@apex-security.co.uk');
    expect(res.company.role).toBe(Role.Owner);
    expect(res.accessToken).toBe('jwt_mock_token_xyz_12345');
    expect(res.refreshToken).toBe('jwt_mock_token_xyz_12345');

    // Verify user in db has hashed password, not plaintext
    const dbUser = await db.findUserByEmail('owner@apex-security.co.uk');
    expect(dbUser).toBeDefined();
    expect(dbUser?.passwordHash).not.toBe('SecurePassword123!');
  });

  it('should reject registration if email already exists', async () => {
    await authService.register({
      companyName: 'Company A',
      email: 'duplicate@test.com',
      password: 'Password123!',
      firstName: 'Alice',
      lastName: 'Smith',
      phone: '+447000111333',
    });

    await expect(
      authService.register({
        companyName: 'Company B',
        email: 'duplicate@test.com',
        password: 'Password123!',
        firstName: 'Bob',
        lastName: 'Jones',
        phone: '+447000111444',
      })
    ).rejects.toThrow(ConflictException);
  });

  it('should login valid user and reject invalid password', async () => {
    await authService.register({
      companyName: 'London Guarding Ltd',
      email: 'manager@londonguarding.co.uk',
      password: 'StrongPassword456!',
      firstName: 'Elena',
      lastName: 'Rostova',
      phone: '+447000111555',
    });

    // Valid login
    const loginRes = await authService.login({
      email: 'manager@londonguarding.co.uk',
      password: 'StrongPassword456!',
    });
    expect(loginRes.accessToken).toBe('jwt_mock_token_xyz_12345');
    expect(loginRes.company.name).toBe('London Guarding Ltd');

    // Invalid password
    await expect(
      authService.login({
        email: 'manager@londonguarding.co.uk',
        password: 'WrongPassword!',
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  describe('Multi-Tenant Isolation (TenantGuard)', () => {
    it('should block cross-company tenant access attempts', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'usr-1', companyId: 'company-apex-1' },
            params: { companyId: 'company-rogue-2' }, // Cross-tenant attempt!
          }),
        }),
      } as any;

      expect(() => tenantGuard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should allow access when tenant matches authenticated user company', () => {
      const mockRequest = {
        user: { id: 'usr-1', companyId: 'company-apex-1' },
        params: { companyId: 'company-apex-1' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any;

      expect(tenantGuard.canActivate(mockContext)).toBe(true);
      expect((mockRequest as any).companyId).toBe('company-apex-1');
    });
  });

  describe('RBAC Roles Guard', () => {
    it('should block employees from accessing Admin/Owner endpoints', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Owner, Role.Admin]);

      const mockContext = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'usr-emp', role: Role.Employee },
          }),
        }),
      } as any;

      expect(() => rolesGuard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should grant access when user holds required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Owner, Role.Admin]);

      const mockContext = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'usr-owner', role: Role.Owner },
          }),
        }),
      } as any;

      expect(rolesGuard.canActivate(mockContext)).toBe(true);
    });
  });
});
