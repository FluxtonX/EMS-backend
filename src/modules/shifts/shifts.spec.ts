import { Test, TestingModule } from '@nestjs/testing';
import { ShiftsService } from './shifts.service';
import { DatabaseService } from '../../database/database.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let db: DatabaseService;

  const mockCompanyId = '00000000-0000-0000-0000-000000000001';
  let mockEmployeeId1: string;
  let mockEmployeeId2: string;
  let mockSiteId: string;
  let mockSiteJobId: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShiftsService, DatabaseService],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
    db = module.get<DatabaseService>(DatabaseService);

    // Setup base fixtures
    const employee1 = await db.createEmployee({
      companyId: mockCompanyId,
      employeeNumber: 'EMP-SHIFT-01',
      firstName: 'James',
      lastName: 'Bond',
      email: 'james.bond@security.uk',
      phone: '+447111222333',
      dateOfBirth: '1988-04-12',
      address: { line1: 'MI6 HQ', city: 'London', postalCode: 'SE1 7TP', country: 'UK' },
      emergencyContact: { name: 'M', relationship: 'Director', phone: '+447000000007' },
      employmentStatus: 'active',
      employmentStartDate: '2025-01-01',
    });
    mockEmployeeId1 = employee1.id;

    const employee2 = await db.createEmployee({
      companyId: mockCompanyId,
      employeeNumber: 'EMP-SHIFT-02',
      firstName: 'Emma',
      lastName: 'Watson',
      email: 'emma.watson@security.uk',
      phone: '+447222333444',
      dateOfBirth: '1992-09-20',
      address: { line1: '221B Baker St', city: 'London', postalCode: 'NW1 6XE', country: 'UK' },
      emergencyContact: { name: 'John Watson', relationship: 'Brother', phone: '+447111999888' },
      employmentStatus: 'active',
      employmentStartDate: '2025-01-01',
    });
    mockEmployeeId2 = employee2.id;

    // Create Site
    const site = await db.createSite({
      companyId: mockCompanyId,
      name: 'London Stadium Arena',
      code: 'LSA-01',
      address: { line1: 'Olympic Park', city: 'London', postalCode: 'E20 2ST', country: 'UK' },
      status: 'active',
    });
    mockSiteId = site.id;

    // Create Job Role
    const jobType = await db.createJobType({
      companyId: mockCompanyId,
      name: 'Door Supervisor',
      isActive: true,
    });

    const sj = await db.createSiteJob({
      companyId: mockCompanyId,
      siteId: site.id,
      jobTypeId: jobType.id,
      defaultPayRate: 15.0,
      billingRate: 22.5,
      currency: 'GBP',
      status: 'active',
    });
    mockSiteJobId = sj.id;

    // Assign employee 1 to this site job
    await db.createAssignment({
      companyId: mockCompanyId,
      employeeId: mockEmployeeId1,
      siteJobId: mockSiteJobId,
      payRate: 15.5,
      startDate: '2025-01-01',
      status: 'active',
    });
  });

  it('should create an Open Position shift when no employee is assigned', async () => {
    const shift = await service.create(
      mockCompanyId,
      {
        siteId: mockSiteId,
        siteJobId: mockSiteJobId,
        shiftDate: '2025-06-01',
        startTime: '08:00',
        endTime: '16:00',
        breakMinutes: 30,
        notes: 'Main gate access control',
      },
      'admin-id'
    );

    expect(shift).toBeDefined();
    expect(shift.id).toBeDefined();
    expect(shift.employeeId).toBeUndefined();
    expect(shift.status).toBe('scheduled');
    expect(shift.startTime).toBe('08:00');
    expect(shift.endTime).toBe('16:00');
    expect(shift.site?.name).toBe('London Stadium Arena');
  });

  it('should create a shift assigned to an employee', async () => {
    const shift = await service.create(
      mockCompanyId,
      {
        siteId: mockSiteId,
        siteJobId: mockSiteJobId,
        employeeId: mockEmployeeId1,
        shiftDate: '2025-06-01',
        startTime: '08:00',
        endTime: '16:00',
        breakMinutes: 30,
      },
      'admin-id'
    );

    expect(shift.employeeId).toBe(mockEmployeeId1);
    expect(shift.employee?.firstName).toBe('James');
  });

  it('should reject shift creation if end time is before or equal to start time', async () => {
    await expect(
      service.create(mockCompanyId, {
        siteId: mockSiteId,
        siteJobId: mockSiteJobId,
        shiftDate: '2025-06-01',
        startTime: '16:00',
        endTime: '08:00',
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject overlapping shift creation for the same employee (Conflict Engine)', async () => {
    // 1. First shift: 08:00 - 16:00
    await service.create(mockCompanyId, {
      siteId: mockSiteId,
      siteJobId: mockSiteJobId,
      employeeId: mockEmployeeId1,
      shiftDate: '2025-06-01',
      startTime: '08:00',
      endTime: '16:00',
    });

    // 2. Overlapping shift: 12:00 - 20:00 (overlaps 12:00-16:00)
    await expect(
      service.create(mockCompanyId, {
        siteId: mockSiteId,
        siteJobId: mockSiteJobId,
        employeeId: mockEmployeeId1,
        shiftDate: '2025-06-01',
        startTime: '12:00',
        endTime: '20:00',
      })
    ).rejects.toThrow(ConflictException);
  });

  it('should allow non-overlapping shifts on the same day for an employee', async () => {
    // 1. Morning shift: 06:00 - 14:00
    const morningShift = await service.create(mockCompanyId, {
      siteId: mockSiteId,
      siteJobId: mockSiteJobId,
      employeeId: mockEmployeeId1,
      shiftDate: '2025-06-01',
      startTime: '06:00',
      endTime: '14:00',
    });
    expect(morningShift.id).toBeDefined();

    // 2. Evening shift: 16:00 - 22:00 (no overlap with 06:00-14:00)
    const eveningShift = await service.create(mockCompanyId, {
      siteId: mockSiteId,
      siteJobId: mockSiteJobId,
      employeeId: mockEmployeeId1,
      shiftDate: '2025-06-01',
      startTime: '16:00',
      endTime: '22:00',
    });
    expect(eveningShift.id).toBeDefined();
  });

  it('should accurately provide eligible employee recommendations with conflict status', async () => {
    // Schedule employee 1 for 08:00 - 16:00
    await service.create(mockCompanyId, {
      siteId: mockSiteId,
      siteJobId: mockSiteJobId,
      employeeId: mockEmployeeId1,
      shiftDate: '2025-06-02',
      startTime: '08:00',
      endTime: '16:00',
    });

    // Query eligible employees for 10:00 - 18:00 on that same date
    const eligible = await service.getEligibleEmployees(mockCompanyId, {
      siteId: mockSiteId,
      siteJobId: mockSiteJobId,
      shiftDate: '2025-06-02',
      startTime: '10:00',
      endTime: '18:00',
    });

    expect(eligible.length).toBe(2);

    const emp1Rec = eligible.find((e) => e.employee.id === mockEmployeeId1);
    const emp2Rec = eligible.find((e) => e.employee.id === mockEmployeeId2);

    expect(emp1Rec?.hasConflict).toBe(true);
    expect(emp1Rec?.isEligible).toBe(false);

    expect(emp2Rec?.hasConflict).toBe(false);
    expect(emp2Rec?.isEligible).toBe(true);
  });

  it('should update shift status and allow assigning an employee to an open shift', async () => {
    // 1. Create open shift
    const openShift = await service.create(mockCompanyId, {
      siteId: mockSiteId,
      siteJobId: mockSiteJobId,
      shiftDate: '2025-06-03',
      startTime: '09:00',
      endTime: '17:00',
    });

    // 2. Assign employee 2
    const updated = await service.update(mockCompanyId, openShift.id, {
      employeeId: mockEmployeeId2,
      status: 'confirmed',
    });

    expect(updated.employeeId).toBe(mockEmployeeId2);
    expect(updated.status).toBe('confirmed');
    expect(updated.employee?.firstName).toBe('Emma');
  });

  it('should delete a scheduled shift cleanly', async () => {
    const shift = await service.create(mockCompanyId, {
      siteId: mockSiteId,
      siteJobId: mockSiteJobId,
      shiftDate: '2025-06-04',
      startTime: '09:00',
      endTime: '17:00',
    });

    const result = await service.delete(mockCompanyId, shift.id, 'admin-id');
    expect(result.success).toBe(true);

    await expect(service.findById(mockCompanyId, shift.id)).rejects.toThrow(NotFoundException);
  });
});
