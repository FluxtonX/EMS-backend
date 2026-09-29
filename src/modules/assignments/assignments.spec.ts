import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentsService } from './assignments.service';
import { DatabaseService } from '../../database/database.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  let db: DatabaseService;

  const mockCompanyId = '00000000-0000-0000-0000-000000000001';
  let mockEmployeeId: string;
  let mockSiteJobId1: string;
  let mockSiteJobId2: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AssignmentsService, DatabaseService],
    }).compile();

    service = module.get<AssignmentsService>(AssignmentsService);
    db = module.get<DatabaseService>(DatabaseService);

    // Setup base fixtures
    const employee = await db.createEmployee({
      companyId: mockCompanyId,
      employeeNumber: 'EMP-ASSIGN-01',
      firstName: 'David',
      lastName: 'Miller',
      email: 'david.miller@example.com',
      phone: '+447000111222',
      dateOfBirth: '1990-05-15',
      address: { line1: '10 Oxford St', city: 'London', postalCode: 'W1D 1BS', country: 'UK' },
      emergencyContact: { name: 'Sarah Miller', relationship: 'Spouse', phone: '+447000333444' },
      employmentStatus: 'active',
      employmentStartDate: '2025-01-01',
    });
    mockEmployeeId = employee.id;

    // Create 2 sites
    const site1 = await db.createSite({
      companyId: mockCompanyId,
      name: 'Canary Wharf Tower',
      code: 'CW-01',
      address: { line1: 'Canary Wharf', city: 'London', postalCode: 'E14 5AB', country: 'UK' },
      status: 'active',
    });

    const site2 = await db.createSite({
      companyId: mockCompanyId,
      name: 'Heathrow Terminal 5',
      code: 'HT-05',
      address: { line1: 'Heathrow Airport', city: 'Hounslow', postalCode: 'TW6 2GA', country: 'UK' },
      status: 'active',
    });

    // Create Job Role
    const jobType = await db.createJobType({
      companyId: mockCompanyId,
      name: 'Security Officer',
      isActive: true,
    });

    // Create Site Jobs
    const sj1 = await db.createSiteJob({
      companyId: mockCompanyId,
      siteId: site1.id,
      jobTypeId: jobType.id,
      defaultPayRate: 14.5,
      billingRate: 21.0,
      currency: 'GBP',
      status: 'active',
    });
    mockSiteJobId1 = sj1.id;

    const sj2 = await db.createSiteJob({
      companyId: mockCompanyId,
      siteId: site2.id,
      jobTypeId: jobType.id,
      defaultPayRate: 16.0,
      billingRate: 24.0,
      currency: 'GBP',
      status: 'active',
    });
    mockSiteJobId2 = sj2.id;
  });

  it('should create an initial assignment and lock the pay rate', async () => {
    const assignment = await service.create(
      mockCompanyId,
      {
        employeeId: mockEmployeeId,
        siteJobId: mockSiteJobId1,
        payRate: 15.0, // custom agreed rate above default £14.50
        startDate: '2025-02-01',
      },
      'admin-user-id'
    );

    expect(assignment).toBeDefined();
    expect(assignment.id).toBeDefined();
    expect(assignment.status).toBe('active');
    expect(Number(assignment.payRate)).toBe(15.0);

    const active = await service.getActiveAssignment(mockCompanyId, mockEmployeeId);
    expect(active).toBeDefined();
    expect(active?.siteJob.site.name).toBe('Canary Wharf Tower');
  });

  it('should fall back to site job default pay rate if payRate is not provided', async () => {
    const assignment = await service.create(mockCompanyId, {
      employeeId: mockEmployeeId,
      siteJobId: mockSiteJobId1,
      startDate: '2025-02-01',
    });

    expect(Number(assignment.payRate)).toBe(14.5);
  });

  it('should reject assignment creation if employee already has an active assignment', async () => {
    await service.create(mockCompanyId, {
      employeeId: mockEmployeeId,
      siteJobId: mockSiteJobId1,
      startDate: '2025-02-01',
    });

    await expect(
      service.create(mockCompanyId, {
        employeeId: mockEmployeeId,
        siteJobId: mockSiteJobId2,
        startDate: '2025-03-01',
      })
    ).rejects.toThrow(ConflictException);
  });

  it('should reject assignment with invalid dates (end date before start date)', async () => {
    await expect(
      service.create(mockCompanyId, {
        employeeId: mockEmployeeId,
        siteJobId: mockSiteJobId1,
        startDate: '2025-05-10',
        endDate: '2025-05-01',
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('should atomically transfer an employee from Site A to Site B', async () => {
    // 1. Initial assignment at Canary Wharf (£14.50)
    const initialAssignment = await service.create(mockCompanyId, {
      employeeId: mockEmployeeId,
      siteJobId: mockSiteJobId1,
      startDate: '2025-01-01',
    });

    // 2. Perform atomic transfer to Heathrow Terminal 5 (£16.00) effective 2025-03-01
    const transferResult = await service.transfer(
      mockCompanyId,
      mockEmployeeId,
      {
        newSiteJobId: mockSiteJobId2,
        transferDate: '2025-03-01',
        reason: 'Site re-deployment request',
      },
      'supervisor-user-id'
    );

    expect(transferResult.previousAssignment?.status).toBe('transferred');
    expect(transferResult.previousAssignment?.endDate).toBe('2025-03-01');

    expect(transferResult.newAssignment.status).toBe('active');
    expect(transferResult.newAssignment.startDate).toBe('2025-03-01');
    expect(Number(transferResult.newAssignment.payRate)).toBe(16.0);

    // 3. Verify history integrity (Section 18 & 22)
    const history = await service.getEmployeeAssignments(mockCompanyId, mockEmployeeId);
    expect(history.length).toBe(2);

    // Active one is Heathrow
    const current = await service.getActiveAssignment(mockCompanyId, mockEmployeeId);
    expect(current?.siteJob.site.name).toBe('Heathrow Terminal 5');
    expect(Number(current?.payRate)).toBe(16.0);

    // Previous one still retains original Canary Wharf rate £14.50
    const previous = history.find((h) => h.id === initialAssignment.id);
    expect(previous?.status).toBe('transferred');
    expect(Number(previous?.payRate)).toBe(14.5);
  });

  it('should close an active assignment cleanly', async () => {
    const assignment = await service.create(mockCompanyId, {
      employeeId: mockEmployeeId,
      siteJobId: mockSiteJobId1,
      startDate: '2025-01-01',
    });

    const closed = await service.close(mockCompanyId, assignment.id, {
      endDate: '2025-04-30',
      reason: 'Contract completion',
    });

    expect(closed?.status).toBe('completed');
    expect(closed?.endDate).toBe('2025-04-30');

    const active = await service.getActiveAssignment(mockCompanyId, mockEmployeeId);
    expect(active).toBeNull();
  });
});
