import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { DatabaseService } from '../src/database/database.service';
import * as crypto from 'crypto';

describe('Complete Workforce Platform E2E Suite (Phases 1 - 10)', () => {
  let app: INestApplication;
  let db: DatabaseService;

  // Company A context
  let companyAId: string;
  let ownerAToken: string;
  let managerAToken: string;
  let employeeAToken: string;
  let employeeAId: string;
  let siteA1Id: string;
  let siteA2Id: string;
  let siteJobA1Id: string;
  let siteJobA2Id: string;
  let assignmentA1Id: string;

  // Company B context (for tenant isolation tests)
  let companyBId: string;
  let ownerBToken: string;

  beforeAll(async () => {
    jest.setTimeout(30000);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
    db = moduleFixture.get<DatabaseService>(DatabaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Company Registration & Authentication (Phase 1)', () => {
    it('should register Company A and return Owner JWT token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'owner@companya-security.co.uk',
          password: 'Password123!',
          firstName: 'Alice',
          lastName: 'Director',
          companyName: 'Company A Security Solutions',
          phone: '+447000111222',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.company.role).toBe('Owner');

      companyAId = res.body.data.company.id;
      ownerAToken = res.body.data.accessToken;
    });

    it('should log in as Owner and receive authenticated session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'owner@companya-security.co.uk',
          password: 'Password123!',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe('owner@companya-security.co.uk');
      ownerAToken = res.body.data.accessToken;
    });
  });

  describe('2. Sites, Job Roles & Rates Matrix Configuration (Phase 4)', () => {
    it('should allow Owner to create client site 1', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sites')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Stratford Stadium Hub',
          code: 'SSH-01',
          address: {
            line1: 'Olympic Way',
            city: 'London',
            postalCode: 'E20 2ST',
            country: 'UK',
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      siteA1Id = res.body.data.id;
    });

    it('should allow Owner to create client site 2', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sites')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Canary Wharf Commercial Tower',
          code: 'CW-02',
          address: {
            line1: '1 Canada Square',
            city: 'London',
            postalCode: 'E14 5AA',
            country: 'UK',
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      siteA2Id = res.body.data.id;
    });

    it('should allow Owner to create company job role catalog item', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/job-types')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'SIA Door Supervisor',
          description: 'Licensed front-of-house security control officer',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      const jobTypeId = res.body.data.id;

      // Configure site job 1
      const sj1Res = await request(app.getHttpServer())
        .post(`/api/v1/sites/${siteA1Id}/jobs`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          jobTypeId,
          defaultPayRate: 16.5,
          billingRate: 26.0,
          currency: 'GBP',
        })
        .expect(201);

      expect(sj1Res.body.success).toBe(true);
      siteJobA1Id = sj1Res.body.data.id;

      // Configure site job 2
      const sj2Res = await request(app.getHttpServer())
        .post(`/api/v1/sites/${siteA2Id}/jobs`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          jobTypeId,
          defaultPayRate: 18.0,
          billingRate: 28.5,
          currency: 'GBP',
        })
        .expect(201);

      expect(sj2Res.body.success).toBe(true);
      siteJobA2Id = sj2Res.body.data.id;
    });
  });

  describe('3. Team Members & Brevo Invitation Flow (Phase 2)', () => {
    let managerTokenRaw: string;

    it('should allow Owner to invite a Manager', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/team/invite')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          email: 'manager@companya-security.co.uk',
          name: 'Marcus Manager',
          role: 'Manager',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.invitation.id).toBeDefined();

      // Retrieve generated token from DB mock store for activation testing
      const invitations = await db.findInvitationsByCompany(companyAId);
      const inv = invitations.find((i) => i.email === 'manager@companya-security.co.uk');
      expect(inv).toBeDefined();
      expect(inv?.status).toBe('pending');
    });

    it('should activate Manager account via token and set password', async () => {
      // Find invitation token hash
      const invitations = await db.findInvitationsByCompany(companyAId);
      const inv = invitations.find((i) => i.email === 'manager@companya-security.co.uk')!;

      // Create a known raw token and hash
      const rawToken = 'test-manager-raw-token-12345';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      inv.tokenHash = tokenHash;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/invitations/activate')
        .send({
          token: rawToken,
          password: 'ManagerPassword123!',
          firstName: 'Marcus',
          lastName: 'Manager',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.company.role).toBe('Manager');
      managerAToken = res.body.data.accessToken;
    });
  });

  describe('4. Five-Step Atomic Employee Onboarding Wizard (Phase 3)', () => {
    it('should allow Manager to onboard employee with initial site assignment & Brevo invite', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/employees/onboard')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          firstName: 'John',
          lastName: 'Workforce',
          email: 'guard.john@security.co.uk',
          phone: '+447888999000',
          dateOfBirth: '1993-07-20',
          address: {
            line1: '14 Millfield Road',
            city: 'London',
            postalCode: 'E15 4QZ',
            country: 'UK',
          },
          emergencyContact: {
            name: 'Mary Workforce',
            relationship: 'Spouse',
            phone: '+447888111222',
          },
          employeeNumber: 'EMP-E2E-100',
          employmentStartDate: '2026-01-01',
          employmentStatus: 'active',
          initialLicence: {
            licenceType: 'Door Supervisor',
            licenceNumber: '1000200030004000',
            expiryDate: '2028-12-31',
          },
          initialAssignment: {
            siteJobId: siteJobA1Id,
            payRate: 16.5,
            startDate: '2026-01-01',
          },
          sendInvitation: true,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.employee.id).toBeDefined();
      expect(res.body.data.employee.accountStatus).toBe('invited');
      expect(res.body.data.assignment.payRate).toBe(16.5);
      expect(res.body.data.licence.licenceNumber).toBe('1000200030004000');
      expect(res.body.data.invitation).toBeDefined();

      employeeAId = res.body.data.employee.id;
      assignmentA1Id = res.body.data.assignment.id;
    });

    it('should reject duplicate employee numbers during onboarding', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/employees/onboard')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          firstName: 'Clone',
          lastName: 'Worker',
          email: 'clone@security.co.uk',
          phone: '+447111222333',
          dateOfBirth: '1990-01-01',
          address: { line1: 'Test', city: 'London', postalCode: 'E1', country: 'UK' },
          emergencyContact: { name: 'None', relationship: 'None', phone: '+447000' },
          employeeNumber: 'EMP-E2E-100', // duplicate
          employmentStartDate: '2026-01-01',
        })
        .expect(409);
    });
  });

  describe('5. Employee Activation & Role Redirection (Phase 1 & 6)', () => {
    it('should activate employee account via single-use invitation token', async () => {
      const rawToken = 'test-employee-raw-token-999';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const invitations = await db.findInvitationsByCompany(companyAId);
      const inv = invitations.find((i) => i.email === 'guard.john@security.co.uk')!;
      inv.tokenHash = tokenHash;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/invitations/activate')
        .send({
          token: rawToken,
          password: 'EmployeePassword123!',
          firstName: 'John',
          lastName: 'Workforce',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.company.role).toBe('Employee');
      employeeAToken = res.body.data.accessToken;

      // Verify employee record is now active and linked to userId
      const emp = await db.findEmployeeById(companyAId, employeeAId);
      expect(emp?.accountStatus).toBe('active');
      expect(emp?.userId).toBeDefined();
    });

    it('should prevent Employee from accessing company-wide admin endpoints (Vertical RBAC)', async () => {
      // Employee attempts to access company employee list
      await request(app.getHttpServer())
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${employeeAToken}`)
        .expect(403);

      // Employee attempts to create an employee
      await request(app.getHttpServer())
        .post('/api/v1/employees/onboard')
        .set('Authorization', `Bearer ${employeeAToken}`)
        .send({})
        .expect(403);
    });
  });

  describe('6. Workforce Assignments & Atomic Reassignment (Phase 5)', () => {
    it('should allow Manager to view company assignments', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignments')
        .set('Authorization', `Bearer ${managerAToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const current = res.body.data.find((a: any) => a.id === assignmentA1Id);
      expect(current).toBeDefined();
      expect(current.payRate).toBe(16.5);
    });

    it('should execute atomic transfer of employee to site 2 with historical rate locking', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignments/employee/${employeeAId}/transfer`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          newSiteJobId: siteJobA2Id,
          newPayRate: 18.0,
          transferDate: '2026-02-01',
          reason: 'Promotion to Canary Wharf commercial control team',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.previousAssignment.status).toBe('transferred');
      expect(res.body.data.previousAssignment.payRate).toBe(16.5);
      expect(res.body.data.newAssignment.status).toBe('active');
      expect(res.body.data.newAssignment.payRate).toBe(18.0);
    });
  });

  describe('7. Identity-Scoped Employee Portal APIs /api/v1/me/* (Phase 6)', () => {
    it('should allow Employee to fetch self-service overview', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me/overview')
        .set('Authorization', `Bearer ${employeeAToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.employee.employeeNumber).toBe('EMP-E2E-100');
      expect(res.body.data.currentAssignment.siteName).toBe('Canary Wharf Commercial Tower');
      expect(res.body.data.currentAssignment.lockedPayRate).toBe(18.0);
      expect(res.body.data.leaveSummary.annualEntitlementDays).toBe(28);
    });

    it('should allow Employee to self-update contact phone and address', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${employeeAToken}`)
        .send({
          phone: '+447999000111',
          address: { city: 'Stratford' },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe('+447999000111');
      expect(res.body.data.address.city).toBe('Stratford');
    });

    it('should allow Employee to punch in with GPS coordinates', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/me/attendance/clock-in')
        .set('Authorization', `Bearer ${employeeAToken}`)
        .send({
          latitude: 51.5045,
          longitude: -0.0195,
          accuracy: 15,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('clocked_in');
    });

    it('should allow Employee to view active attendance punch', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me/attendance')
        .set('Authorization', `Bearer ${employeeAToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.activePunch).toBeDefined();
      expect(res.body.data.activePunch.status).toBe('clocked_in');
    });

    it('should allow Employee to punch out with GPS coordinates', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/me/attendance/clock-out')
        .set('Authorization', `Bearer ${employeeAToken}`)
        .send({
          latitude: 51.5045,
          longitude: -0.0195,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('clocked_out');
    });

    it('should allow Employee to submit a holiday leave request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/me/leave')
        .set('Authorization', `Bearer ${employeeAToken}`)
        .send({
          leaveType: 'annual',
          startDate: '2026-07-01',
          endDate: '2026-07-05',
          reason: 'Annual summer break',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.totalDays).toBeGreaterThan(0);
    });

    it('should allow Employee to register device token for push alerts (Phase 7)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${employeeAToken}`)
        .send({
          deviceType: 'web',
          platform: 'Chrome MacOS',
          pushToken: 'push-token-web-e2e-abc-123',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.pushToken).toBe('push-token-web-e2e-abc-123');
    });
  });

  describe('8. Zero-Trust Security & Cross-Tenant Isolation (Phase 9)', () => {
    it('should register Company B as an isolated tenant', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'director@companyb-security.co.uk',
          password: 'Password123!',
          firstName: 'Bob',
          lastName: 'Competitor',
          companyName: 'Company B Tactical Defense',
          phone: '+447111333444',
        })
        .expect(201);

      companyBId = res.body.data.company.id;
      ownerBToken = res.body.data.accessToken;
      expect(companyBId).not.toBe(companyAId);
    });

    it('should prevent Company B from accessing Company A employees (IDOR/BOLA Prevention)', async () => {
      // Company B Owner attempts to fetch Company A's employee
      await request(app.getHttpServer())
        .get(`/api/v1/employees/${employeeAId}`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(404);
    });

    it('should prevent Company B from seeing Company A assignments', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignments')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(0);
    });
  });
});
