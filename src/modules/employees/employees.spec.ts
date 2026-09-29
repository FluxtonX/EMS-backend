import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { DatabaseModule } from '../../database/database.module';
import { DatabaseService } from '../../database/database.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CreateEmployeeDto, EmploymentStatusEnum } from './dto/create-employee.dto';

describe('Phase 2: Employees Module Tests', () => {
  let service: EmployeesService;
  let db: DatabaseService;

  const companyA = 'comp_alpha_111';
  const companyB = 'comp_beta_222';
  const actorId = 'actor_admin_999';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [EmployeesService],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
    db = module.get<DatabaseService>(DatabaseService);
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

    // Same employee number in Company B should succeed
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

    // Found within company A
    const found = await service.findById(companyA, created.id);
    expect(found).toBeDefined();
    expect(found.firstName).toBe('Marcus');
    expect(found.licences.length).toBe(1);

    // Attempt to access from company B should throw NotFoundException
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

    // Search by name
    const searchRes = await service.findAll(companyA, { search: 'Alice' });
    expect(searchRes.items.length).toBe(1);
    expect(searchRes.items[0].firstName).toBe('Alice');

    // Filter by status probation
    const statusRes = await service.findAll(companyA, { status: 'probation' });
    expect(statusRes.items.some((e) => e.firstName === 'Bob')).toBe(true);

    // Pagination
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

    // Verify audit log
    const logs = await db.getAuditLogs(companyA);
    expect(logs.some((l) => l.action === 'EMPLOYEE_UPDATED' && l.entityId === created.id)).toBe(true);
  });
});
