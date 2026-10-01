import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { DatabaseModule } from '../../database/database.module';
import { DatabaseService } from '../../database/database.service';
import { BrevoService } from '../notifications/brevo.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateEmployeeDto, EmploymentStatusEnum } from './dto/create-employee.dto';
import { OnboardEmployeeDto } from './dto/onboard-employee.dto';

describe('Employees Module & Onboarding Tests (Phase 3)', () => {
  let service: EmployeesService;
  let db: DatabaseService;
  let brevoMock: { sendInvitationEmail: jest.Mock };

  let companyA: string;
  let companyB: string;
  const actorId = 'actor_admin_999';

  beforeEach(async () => {
    brevoMock = {
      sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [
        EmployeesService,
        AssignmentsService,
        {
          provide: BrevoService,
          useValue: brevoMock,
        },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
    db = module.get<DatabaseService>(DatabaseService);

    // Seed companies
    const compA = await db.createCompany({
      name: 'Alpha Security Ltd',
      slug: `alpha-security-${Date.now()}`,
      status: 'active',
      subscriptionTier: 'enterprise',
    });
    companyA = compA.id;

    const compB = await db.createCompany({
      name: 'Beta Guarding Ltd',
      slug: `beta-guarding-${Date.now()}`,
      status: 'active',
      subscriptionTier: 'pro',
    });
    companyB = compB.id;
  });

  const validEmployeeDto: CreateEmployeeDto = {
    employeeNumber: 'EMP-1001',
    firstName: 'Marcus',
    lastName: 'Vance',
    email: 'marcus.vance@workforce.co.uk',
    phone: '+44 7700 900123',
    dateOfBirth: '1992-06-15',
    address: {
      line1: '124 High Street',
      city: 'London',
      postalCode: 'E1 6AN',
      country: 'United Kingdom',
    },
    emergencyContact: {
      name: 'Claire Vance',
      relationship: 'Spouse',
      phone: '+44 7700 900456',
    },
    employmentStatus: EmploymentStatusEnum.ACTIVE,
    employmentStartDate: '2026-01-10',
    initialLicence: {
      licenceType: 'SIA Door Supervisor',
      licenceNumber: '1029384756',
      expiryDate: '2027-01-10',
    },
  };

  it('should successfully create an employee with address and initial licence', async () => {
    const emp = await service.create(companyA, actorId, validEmployeeDto);

    expect(emp).toBeDefined();
    expect(emp.id).toBeDefined();
    expect(emp.employeeNumber).toBe('EMP-1001');
    expect(emp.firstName).toBe('Marcus');
    expect(emp.licence).toBeDefined();
    expect(emp.licence?.licenceNumber).toBe('1029384756');
    expect(emp.licence?.status).toBe('valid');

    // Verify audit record was created
    const logs = await db.getAuditLogs(companyA);
    expect(logs.some((l) => l.action === 'EMPLOYEE_CREATED' && l.entityId === emp.id)).toBe(true);
  });

  it('should reject duplicate employee numbers within the same company', async () => {
    await service.create(companyA, actorId, validEmployeeDto);

    await expect(
      service.create(companyA, actorId, {
        ...validEmployeeDto,
        email: 'different.email@workforce.co.uk',
      })
    ).rejects.toThrow(ConflictException);
  });

  it('should allow identical employee numbers in a DIFFERENT company (multi-tenant boundary)', async () => {
    await service.create(companyA, actorId, validEmployeeDto);

    const empB = await service.create(companyB, actorId, {
      ...validEmployeeDto,
      email: 'marcus.beta@workforce.co.uk',
    });

    expect(empB).toBeDefined();
    expect(empB.companyId).toBe(companyB);
    expect(empB.employeeNumber).toBe('EMP-1001');
  });

  it('should find employee by id and isolate from other companies', async () => {
    const created = await service.create(companyA, actorId, validEmployeeDto);

    const found = await service.findById(companyA, created.id);
    expect(found).toBeDefined();
    expect(found.firstName).toBe('Marcus');
    expect(found.licences.length).toBe(1);

    await expect(service.findById(companyB, created.id)).rejects.toThrow(NotFoundException);
  });

  it('should support search, pagination, and status filters', async () => {
    await service.create(companyA, actorId, {
      ...validEmployeeDto,
      employeeNumber: 'EMP-2001',
      firstName: 'Alice',
      lastName: 'Kingsley',
      employmentStatus: EmploymentStatusEnum.ACTIVE,
    });
    await service.create(companyA, actorId, {
      ...validEmployeeDto,
      employeeNumber: 'EMP-2002',
      firstName: 'Bob',
      lastName: 'Morrison',
      employmentStatus: EmploymentStatusEnum.PROBATION,
    });

    const searchRes = await service.findAll(companyA, { search: 'Alice' });
    expect(searchRes.items.length).toBe(1);
    expect(searchRes.items[0].firstName).toBe('Alice');

    const statusRes = await service.findAll(companyA, { status: 'probation' });
    expect(statusRes.items.some((e) => e.firstName === 'Bob')).toBe(true);

    const pageRes = await service.findAll(companyA, { page: 1, limit: 1 });
    expect(pageRes.items.length).toBe(1);
    expect(pageRes.total).toBeGreaterThanOrEqual(2);
  });

  it('should update employee profile details and record audit log', async () => {
    const created = await service.create(companyA, actorId, validEmployeeDto);

    const updated = await service.update(companyA, actorId, created.id, {
      phone: '+44 7999 888777',
      employmentStatus: EmploymentStatusEnum.SUSPENDED,
    });

    expect(updated).toBeDefined();
    expect(updated?.phone).toBe('+44 7999 888777');
    expect(updated?.employmentStatus).toBe('suspended');

    const logs = await db.getAuditLogs(companyA);
    expect(logs.some((l) => l.action === 'EMPLOYEE_UPDATED' && l.entityId === created.id)).toBe(true);
  });

  describe('5-Step Employee Onboarding Wizard Flow', () => {
    it('should atomically onboard employee, create initial assignment, dispatch Brevo invite, and record audit log', async () => {
      // Setup site and site job
      const site = await db.createSite({
        companyId: companyA,
        name: 'The Shard London Bridge',
        code: 'SHD-01',
        address: { line1: '32 London Bridge St', city: 'London', postalCode: 'SE1 9SG', country: 'UK' },
        status: 'active',
      });
      const jobType = await db.createJobType({
        companyId: companyA,
        name: 'Senior Concierge Officer',
        isActive: true,
      });
      const siteJob = await db.createSiteJob({
        companyId: companyA,
        siteId: site.id,
        jobTypeId: jobType.id,
        defaultPayRate: 15.5,
        billingRate: 23.0,
        currency: 'GBP',
        status: 'active',
      });

      const onboardDto: OnboardEmployeeDto = {
        firstName: 'Elena',
        lastName: 'Rostova',
        email: 'elena.rostova@security.co.uk',
        phone: '+44 7700 900789',
        dateOfBirth: '1994-08-20',
        address: {
          line1: '45 Tower Bridge Rd',
          city: 'London',
          postalCode: 'SE1 4TR',
          country: 'United Kingdom',
        },
        emergencyContact: {
          name: 'Igor Rostov',
          relationship: 'Brother',
          phone: '+44 7700 900890',
        },
        employmentStatus: EmploymentStatusEnum.ACTIVE,
        employmentStartDate: '2026-03-01',
        initialAssignment: {
          siteJobId: siteJob.id,
          payRate: 16.5, // locked agreed rate
          startDate: '2026-03-01',
        },
        initialLicence: {
          licenceType: 'SIA CCTV Surveillance',
          licenceNumber: '9988776655',
          expiryDate: '2027-10-01',
        },
        sendInvitation: true,
      };

      const result = await service.onboard(companyA, actorId, 'Admin User', onboardDto);

      // Verify employee creation
      expect(result.employee).toBeDefined();
      expect(result.employee.firstName).toBe('Elena');
      expect(result.employee.accountStatus).toBe('invited');
      expect(result.employee.employeeNumber).toMatch(/^EMP-\d{4}-\d{4}$/); // Auto-generated ID format

      // Verify initial assignment
      expect(result.assignment).toBeDefined();
      expect(result.assignment.siteJobId).toBe(siteJob.id);
      expect(Number(result.assignment.payRate)).toBe(16.5);
      expect(result.assignment.status).toBe('active');

      // Verify licence
      expect(result.licence).toBeDefined();
      expect(result.licence?.licenceNumber).toBe('9988776655');

      // Verify Brevo email was triggered
      expect(brevoMock.sendInvitationEmail).toHaveBeenCalledTimes(1);
      expect(brevoMock.sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'elena.rostova@security.co.uk',
          role: 'Employee',
          companyName: 'Alpha Security Ltd',
        })
      );

      // Verify invitation record in database
      const invitations = await db.findInvitationsByCompany(companyA);
      const invite = invitations.find((i) => i.targetId === result.employee.id);
      expect(invite).toBeDefined();
      expect(invite?.status).toBe('pending');
      expect(invite?.role).toBe('Employee');

      // Verify audit trail
      const logs = await db.getAuditLogs(companyA);
      expect(logs.some((l) => l.action === 'EMPLOYEE_ONBOARDED' && l.entityId === result.employee.id)).toBe(true);
    });

    it('should allow resending invitation to an unactivated employee', async () => {
      const onboardDto: OnboardEmployeeDto = {
        firstName: 'Thomas',
        lastName: 'Shelby',
        email: 'thomas.shelby@peaky.co.uk',
        phone: '+44 7700 900555',
        dateOfBirth: '1985-04-12',
        address: {
          line1: 'Garrison Lane',
          city: 'Birmingham',
          postalCode: 'B9 4NY',
          country: 'United Kingdom',
        },
        emergencyContact: {
          name: 'Arthur Shelby',
          relationship: 'Brother',
          phone: '+44 7700 900666',
        },
        employmentStatus: EmploymentStatusEnum.ACTIVE,
        employmentStartDate: '2026-03-01',
        sendInvitation: true,
      };

      const onboardResult = await service.onboard(companyA, actorId, 'Admin User', onboardDto);
      expect(brevoMock.sendInvitationEmail).toHaveBeenCalledTimes(1);

      // Resend invitation
      const resendRes = await service.resendInvite(companyA, actorId, onboardResult.employee.id);
      expect(resendRes.message).toContain('successfully resent');
      expect(brevoMock.sendInvitationEmail).toHaveBeenCalledTimes(2);

      // Verify previous invite is expired and new one is pending
      const invitations = await db.findInvitationsByCompany(companyA);
      const pendingInvites = invitations.filter(
        (i) => i.targetId === onboardResult.employee.id && i.status === 'pending'
      );
      expect(pendingInvites.length).toBe(1);
    });

    it('should reject resending invitation if employee has already activated their account', async () => {
      const onboardDto: OnboardEmployeeDto = {
        firstName: 'Grace',
        lastName: 'Burgess',
        email: 'grace.burgess@crown.co.uk',
        phone: '+44 7700 900111',
        dateOfBirth: '1988-02-14',
        address: {
          line1: '10 Downing St',
          city: 'London',
          postalCode: 'SW1A 2AA',
          country: 'United Kingdom',
        },
        emergencyContact: {
          name: 'Charles Burgess',
          relationship: 'Father',
          phone: '+44 7700 900222',
        },
        employmentStatus: EmploymentStatusEnum.ACTIVE,
        employmentStartDate: '2026-03-01',
        sendInvitation: true,
      };

      const onboardResult = await service.onboard(companyA, actorId, 'Admin User', onboardDto);

      // Mark account as active
      await db.updateEmployee(companyA, onboardResult.employee.id, {
        accountStatus: 'active',
        userId: 'usr_activated_777',
      });

      await expect(
        service.resendInvite(companyA, actorId, onboardResult.employee.id)
      ).rejects.toThrow(BadRequestException);
    });
  });
});
