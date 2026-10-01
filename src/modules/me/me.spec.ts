import { Test, TestingModule } from '@nestjs/testing';
import { MeService } from './me.service';
import { DatabaseService } from '../../database/database.service';
import { AttendanceService } from '../attendance/attendance.service';
import { LeaveService } from '../leave/leave.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('MeService', () => {
  let service: MeService;
  let db: DatabaseService;

  const mockCompanyId = '00000000-0000-0000-0000-000000000001';
  let mockUser: AuthenticatedUser;
  let mockEmployeeId: string;
  let mockSiteId: string;
  let mockSiteJobId: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeService,
        DatabaseService,
        AttendanceService,
        LeaveService,
      ],
    }).compile();

    service = module.get<MeService>(MeService);
    db = module.get<DatabaseService>(DatabaseService);

    // Setup User and Employee
    const user = await db.createUser({
      email: 'guard.dan@security.uk',
      passwordHash: 'hashed_pw',
      firstName: 'Dan',
      lastName: 'Guard',
      isActive: true,
    });

    mockUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyId: mockCompanyId,
      role: 'Employee',
    };

    const employee = await db.createEmployee({
      companyId: mockCompanyId,
      userId: user.id,
      employeeNumber: 'EMP-SEC-99',
      firstName: 'Dan',
      lastName: 'Guard',
      email: 'guard.dan@security.uk',
      phone: '+447000111222',
      dateOfBirth: '1995-05-15',
      address: { line1: '10 High Street', city: 'London', postalCode: 'E1 6AN', country: 'UK' },
      emergencyContact: { name: 'Sarah Guard', relationship: 'Spouse', phone: '+447000333444' },
      employmentStatus: 'active',
      accountStatus: 'active',
      employmentStartDate: '2025-01-01',
    });
    mockEmployeeId = employee.id;

    // Create Site and Job
    const site = await db.createSite({
      companyId: mockCompanyId,
      name: 'Central Bank HQ',
      code: 'CB-01',
      address: { line1: '1 Threadneedle St', city: 'London', postalCode: 'EC2R 8AH', country: 'UK' },
      status: 'active',
    });
    mockSiteId = site.id;

    const jobType = await db.createJobType({
      companyId: mockCompanyId,
      name: 'Security Officer',
      isActive: true,
    });

    const siteJob = await db.createSiteJob({
      companyId: mockCompanyId,
      siteId: site.id,
      jobTypeId: jobType.id,
      defaultPayRate: 15.5,
      billingRate: 25.0,
      currency: 'GBP',
      status: 'active',
    });
    mockSiteJobId = siteJob.id;

    // Create Assignment
    await db.createAssignment({
      companyId: mockCompanyId,
      employeeId: employee.id,
      siteJobId: siteJob.id,
      payRate: 15.5,
      startDate: '2025-01-01',
      status: 'active',
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should resolve employee for authenticated user and return dashboard overview', async () => {
    const overview = await service.getOverview(mockCompanyId, mockUser);
    expect(overview).toBeDefined();
    expect(overview.employee.employeeNumber).toBe('EMP-SEC-99');
    expect(overview.currentAssignment?.siteName).toBe('Central Bank HQ');
    expect(overview.currentAssignment?.lockedPayRate).toBe(15.5);
    expect(overview.leaveSummary.annualEntitlementDays).toBe(28);
  });

  it('should retrieve full self-service profile', async () => {
    const profile = await service.getProfile(mockCompanyId, mockUser);
    expect(profile.firstName).toBe('Dan');
    expect(profile.currentAssignment?.siteJob.site.name).toBe('Central Bank HQ');
  });

  it('should allow employee to self-update contact info', async () => {
    const updated = await service.updateProfile(mockCompanyId, mockUser, {
      phone: '+447999888777',
      address: {
        city: 'Manchester',
      },
    });
    expect(updated?.phone).toBe('+447999888777');
    expect(updated?.address.city).toBe('Manchester');
  });

  it('should retrieve assignment details with historical protection', async () => {
    const assignments = await service.getAssignment(mockCompanyId, mockUser);
    expect(assignments.current).toBeDefined();
    expect(assignments.current?.siteJob.site.name).toBe('Central Bank HQ');
    expect(assignments.history).toHaveLength(0);
  });

  it('should handle clock in and clock out operations for authenticated employee', async () => {
    const clockIn = await service.clockIn(mockCompanyId, mockUser, {
      siteId: mockSiteId,
      latitude: 51.5138,
      longitude: -0.0886,
    });
    expect(clockIn.status).toBe('clocked_in');

    const attendanceState = await service.getAttendance(mockCompanyId, mockUser);
    expect(attendanceState.activePunch).toBeDefined();
    expect(attendanceState.activePunch?.id).toBe(clockIn.id);

    const clockOut = await service.clockOut(mockCompanyId, mockUser, {
      latitude: 51.5138,
      longitude: -0.0886,
    });
    expect(clockOut.status).toBe('clocked_out');
  });

  it('should allow submitting a leave request and querying leave summary', async () => {
    const leave = await service.createLeaveRequest(mockCompanyId, mockUser, {
      leaveType: 'annual' as any,
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      reason: 'Summer holiday',
    });
    expect(leave.id).toBeDefined();
    expect(leave.status).toBe('pending');

    const summary = await service.getLeave(mockCompanyId, mockUser);
    expect(summary.requests).toHaveLength(1);
    expect(summary.entitlement.pendingDays).toBe(leave.totalDays);
  });
});
