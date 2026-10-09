import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService, EmployeeEntity } from '../../database/database.service';
import { AttendanceService } from '../attendance/attendance.service';
import { LeaveService } from '../leave/leave.service';
import { LicencesService } from '../licences/licences.service';
import { CreateLicenceDto } from '../licences/dto/create-licence.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { MyClockInDto, MyClockOutDto } from './dto/my-attendance.dto';
import { MyLeaveRequestDto } from './dto/my-leave-request.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly attendanceService: AttendanceService,
    private readonly leaveService: LeaveService,
    private readonly licencesService: LicencesService
  ) {}

  /**
   * Resolve Employee entity associated with the authenticated User
   * Enforces Section 24 Identity Scoping
   */
  async getEmployeeForUser(companyId: string, user: AuthenticatedUser): Promise<EmployeeEntity> {
    // 1. First attempt direct lookup by user_id
    let employee = await this.db.findEmployeeByUserId(companyId, user.id);
    if (employee) {
      return employee;
    }

    // 2. Fallback: Lookup by normalized email and atomically bind user_id
    const searchResult = await this.db.findEmployees(companyId, { search: user.email });
    const matching = searchResult.items.find(
      (e) => e.email.toLowerCase() === user.email.toLowerCase()
    );

    if (matching) {
      this.logger.log(
        `Binding user ${user.id} (${user.email}) to employee record ${matching.id} (${matching.employeeNumber}).`
      );
      const updated = await this.db.updateEmployee(companyId, matching.id, {
        userId: user.id,
        accountStatus: 'active',
      });
      return updated || matching;
    }

    throw new NotFoundException(
      'No workforce employee profile is linked to your user account. Please contact your company administrator.'
    );
  }

  /**
   * Minimalist, high-signal dashboard overview for Employee AppShell
   */
  async getOverview(companyId: string, user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(companyId, user);
    const company = await this.db.findCompanyById(companyId);

    // Active Assignment
    const activeAssignment = await this.db.findActiveAssignmentByEmployeeId(companyId, employee.id);

    // Primary Licence
    const licences = await this.db.findLicencesByEmployeeId(companyId, employee.id);
    const primaryLicence = licences[0] || null;

    // Upcoming Shifts
    const todayStr = new Date().toISOString().split('T')[0];
    const shifts = await this.db.findShifts(companyId, {
      employeeId: employee.id,
      startDate: todayStr,
    });
    const upcomingShifts = (shifts || [])
      .filter((s) => s.status !== 'cancelled')
      .sort((a, b) => new Date(`${a.shiftDate}T${a.startTime}`).getTime() - new Date(`${b.shiftDate}T${b.startTime}`).getTime());
    const nextShift = upcomingShifts[0] || null;

    // Today's active attendance punch
    const recentAttendance = await this.attendanceService.findAll(companyId, {
      employeeId: employee.id,
      startDate: todayStr,
    });
    const activeClockIn = (recentAttendance || []).find(
      (a) => a.status === 'clocked_in' && !a.clockOutTime
    );

    // Leave summary
    const leaveRequests = await this.db.findLeaveRequests(companyId, { employeeId: employee.id });
    const approvedDays = leaveRequests
      .filter((l) => l.status === 'approved')
      .reduce((acc, curr) => acc + curr.totalDays, 0);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        phone: employee.phone,
        employmentStatus: employee.employmentStatus,
        accountStatus: employee.accountStatus,
        employmentStartDate: employee.employmentStartDate,
      },
      company: company
        ? {
            id: company.id,
            name: company.name,
            slug: company.slug,
          }
        : null,
      currentAssignment: activeAssignment
        ? {
            id: activeAssignment.id,
            siteId: activeAssignment.siteJob.site.id,
            siteName: activeAssignment.siteJob.site.name,
            siteCode: activeAssignment.siteJob.site.code,
            address: activeAssignment.siteJob.site.address,
            roleName: activeAssignment.siteJob.jobType.name,
            lockedPayRate: activeAssignment.payRate,
            startDate: activeAssignment.startDate,
          }
        : null,
      licence: primaryLicence
        ? {
            id: primaryLicence.id,
            type: primaryLicence.licenceType,
            number: primaryLicence.licenceNumber,
            expiryDate: primaryLicence.expiryDate,
            status: primaryLicence.status,
          }
        : null,
      nextShift: nextShift
        ? {
            id: nextShift.id,
            shiftDate: nextShift.shiftDate,
            startTime: nextShift.startTime,
            endTime: nextShift.endTime,
            status: nextShift.status,
            siteId: nextShift.siteId,
            siteName: nextShift.site?.name || 'Assigned Site',
            roleName: nextShift.siteJob?.jobType?.name || 'Security Officer',
          }
        : null,
      activeClockIn: activeClockIn
        ? {
            id: activeClockIn.id,
            clockInTime: activeClockIn.clockInTime,
            siteId: activeClockIn.siteId,
            status: activeClockIn.status,
          }
        : null,
      leaveSummary: {
        annualEntitlementDays: 28, // UK standard statutory minimum
        approvedDays,
        remainingDays: Math.max(0, 28 - approvedDays),
      },
    };
  }

  /**
   * Detailed self-service profile
   */
  async getProfile(companyId: string, user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(companyId, user);
    const licences = await this.db.findLicencesByEmployeeId(companyId, employee.id);
    const activeAssignment = await this.db.findActiveAssignmentByEmployeeId(companyId, employee.id);

    return {
      ...employee,
      licences,
      currentAssignment: activeAssignment,
    };
  }

  /**
   * Employee self-update contact information
   */
  async updateProfile(companyId: string, user: AuthenticatedUser, dto: UpdateMyProfileDto) {
    const employee = await this.getEmployeeForUser(companyId, user);

    const updates: any = {};
    if (dto.avatarUrl !== undefined) updates.avatarUrl = dto.avatarUrl;
    if (dto.phone) updates.phone = dto.phone.trim();
    if (dto.address) {
      updates.address = {
        ...employee.address,
        ...dto.address,
      };
    }
    if (dto.emergencyContact) {
      updates.emergencyContact = {
        ...employee.emergencyContact,
        ...dto.emergencyContact,
      };
    }

    const updated = await this.db.updateEmployee(companyId, employee.id, updates);

    await this.db.recordAudit({
      companyId,
      userId: user.id,
      action: 'EMPLOYEE_SELF_PROFILE_UPDATE',
      entity: 'employees',
      entityId: employee.id,
      newValue: updates,
    });

    return updated;
  }

  /**
   * Company Information
   */
  async getCompany(companyId: string, user: AuthenticatedUser) {
    const company = await this.db.findCompanyById(companyId);
    if (!company) {
      throw new NotFoundException('Company workspace not found.');
    }
    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      registrationNumber: company.registrationNumber,
      status: company.status,
    };
  }

  /**
   * Active and historical deployments
   */
  async getAssignment(companyId: string, user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(companyId, user);
    const allAssignments = await this.db.findAssignmentsByEmployeeId(companyId, employee.id);

    const active = allAssignments.find((a) => a.status === 'active') || null;
    const history = allAssignments.filter((a) => a.id !== active?.id);

    return {
      current: active,
      history,
    };
  }

  /**
   * Employee Shifts list
   */
  async getShifts(
    companyId: string,
    user: AuthenticatedUser,
    options?: { status?: string; from?: string; to?: string }
  ) {
    const employee = await this.getEmployeeForUser(companyId, user);

    const query: any = {
      employeeId: employee.id,
    };
    if (options?.from) query.startDate = options.from;
    if (options?.to) query.endDate = options.to;
    if (options?.status && options.status !== 'all') query.status = options.status;

    const shifts = await this.db.findShifts(companyId, query);

    return {
      items: shifts || [],
      total: (shifts || []).length,
    };
  }

  /**
   * Acknowledge/Confirm scheduled shift
   */
  async acknowledgeShift(companyId: string, user: AuthenticatedUser, shiftId: string) {
    const employee = await this.getEmployeeForUser(companyId, user);
    const shift = await this.db.findShiftById(companyId, shiftId);

    if (!shift || shift.employeeId !== employee.id) {
      throw new NotFoundException('Shift not found or not assigned to you.');
    }

    if (shift.status === 'scheduled') {
      const updated = await this.db.updateShift(companyId, shiftId, {
        status: 'confirmed',
      });
      return updated;
    }

    return shift;
  }

  /**
   * Attendance records & active status
   */
  async getAttendance(companyId: string, user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(companyId, user);

    const records = await this.attendanceService.findAll(companyId, {
      employeeId: employee.id,
    });

    const activePunch = (records || []).find(
      (a) => a.status === 'clocked_in' && !a.clockOutTime
    );

    return {
      activePunch: activePunch || null,
      history: records || [],
      total: (records || []).length,
    };
  }

  /**
   * Clock in with GPS coordinates and Geofence validation
   */
  async clockIn(companyId: string, user: AuthenticatedUser, dto: MyClockInDto) {
    const employee = await this.getEmployeeForUser(companyId, user);

    // Identify target site: from payload or from active assignment
    let siteId = dto.siteId;
    if (!siteId) {
      const activeAssignment = await this.db.findActiveAssignmentByEmployeeId(companyId, employee.id);
      if (!activeAssignment) {
        throw new BadRequestException(
          'You do not have an active site assignment. Please select a site to clock in.'
        );
      }
      siteId = activeAssignment.siteJob.site.id;
    }

    // Verify no existing active punch
    const todayStr = new Date().toISOString().split('T')[0];
    const existing = await this.attendanceService.findAll(companyId, {
      employeeId: employee.id,
      startDate: todayStr,
    });
    const alreadyClockedIn = (existing || []).find(
      (a) => a.status === 'clocked_in' && !a.clockOutTime
    );
    if (alreadyClockedIn) {
      throw new BadRequestException(
        `You are already clocked in (since ${new Date(alreadyClockedIn.clockInTime).toLocaleTimeString('en-GB')}). Please clock out first.`
      );
    }

    // Execute clock in via AttendanceService
    return this.attendanceService.clockIn(
      companyId,
      {
        employeeId: employee.id,
        siteId,
        shiftId: dto.shiftId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
      },
      user.id
    );
  }

  /**
   * Clock out with GPS coordinates
   */
  async clockOut(companyId: string, user: AuthenticatedUser, dto: MyClockOutDto) {
    const employee = await this.getEmployeeForUser(companyId, user);

    // Locate active clock-in record
    const records = await this.attendanceService.findAll(companyId, {
      employeeId: employee.id,
    });
    const activePunch = (records || []).find(
      (a) => a.status === 'clocked_in' && !a.clockOutTime
    );

    if (!activePunch) {
      throw new BadRequestException('No active clock-in session found to clock out from.');
    }

    return this.attendanceService.clockOut(
      companyId,
      activePunch.id,
      {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
      },
      user.id
    );
  }

  /**
   * SIA Licences
   */
  async getLicences(companyId: string, user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(companyId, user);
    return this.db.findLicencesByEmployeeId(companyId, employee.id);
  }

  async createLicence(companyId: string, user: AuthenticatedUser, dto: CreateLicenceDto) {
    const employee = await this.getEmployeeForUser(companyId, user);
    return this.licencesService.createEmployeeSubmissionLicence(companyId, employee.id, dto);
  }

  /**
   * Leave requests & Entitlement
   */
  async getLeave(companyId: string, user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(companyId, user);
    const requests = await this.db.findLeaveRequests(companyId, { employeeId: employee.id });

    const approvedDays = requests
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => sum + r.totalDays, 0);

    const pendingDays = requests
      .filter((r) => r.status === 'pending')
      .reduce((sum, r) => sum + r.totalDays, 0);

    return {
      entitlement: {
        annualTotal: 28,
        approvedDays,
        pendingDays,
        remainingDays: Math.max(0, 28 - approvedDays),
      },
      requests: requests.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    };
  }

  /**
   * Submit Leave Request
   */
  async createLeaveRequest(companyId: string, user: AuthenticatedUser, dto: MyLeaveRequestDto) {
    const employee = await this.getEmployeeForUser(companyId, user);

    return this.leaveService.createLeaveRequest(
      companyId,
      {
        employeeId: employee.id,
        leaveType: dto.leaveType as any,
        startDate: dto.startDate,
        endDate: dto.endDate,
        reason: dto.reason,
      },
      user.id
    );
  }
}
