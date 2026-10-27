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
import { TimesheetsService } from '../timesheets/timesheets.service';
import { Optional } from '@nestjs/common';

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly attendanceService: AttendanceService,
    private readonly leaveService: LeaveService,
    private readonly licencesService: LicencesService,
    @Optional() private readonly timesheetsService?: TimesheetsService
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
      (a) => (a.status === 'clocked_in' || a.status === 'on_break') && !a.clockOutTime
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
      (a) => (a.status === 'clocked_in' || a.status === 'on_break') && !a.clockOutTime
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
   * Start rest break for active attendance session
   */
  async startBreak(companyId: string, user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(companyId, user);
    const records = await this.attendanceService.findAll(companyId, {
      employeeId: employee.id,
    });
    const activePunch = (records || []).find(
      (a) => a.status === 'clocked_in' && !a.clockOutTime
    );

    if (!activePunch) {
      throw new BadRequestException('No active duty session found to start a break. Must be clocked in.');
    }

    return this.attendanceService.startBreak(companyId, activePunch.id, user.id);
  }

  /**
   * End rest break and resume duty
   */
  async endBreak(companyId: string, user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(companyId, user);
    const records = await this.attendanceService.findAll(companyId, {
      employeeId: employee.id,
    });
    const activeBreak = (records || []).find(
      (a) => a.status === 'on_break' && !a.clockOutTime
    );

    if (!activeBreak) {
      throw new BadRequestException('No active on-break session found to end.');
    }

    return this.attendanceService.endBreak(companyId, activeBreak.id, user.id);
  }

  /**
   * Clock out with GPS coordinates
   */
  async clockOut(companyId: string, user: AuthenticatedUser, dto: MyClockOutDto) {
    const employee = await this.getEmployeeForUser(companyId, user);

    // Locate active clock-in or on-break record
    const records = await this.attendanceService.findAll(companyId, {
      employeeId: employee.id,
    });
    const activePunch = (records || []).find(
      (a) => (a.status === 'clocked_in' || a.status === 'on_break') && !a.clockOutTime
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

    const currentYear = new Date().getFullYear();
    const thisYearRequests = requests.filter((r) => {
      const year = new Date(r.startDate).getFullYear();
      return year === currentYear;
    });

    // Only Annual Leave deducts from statutory holiday entitlement (28 days UK standard)
    const approvedAnnualDays = thisYearRequests
      .filter((r) => r.status === 'approved' && r.leaveType === 'annual')
      .reduce((sum, r) => sum + r.totalDays, 0);

    const pendingAnnualDays = thisYearRequests
      .filter((r) => r.status === 'pending' && r.leaveType === 'annual')
      .reduce((sum, r) => sum + r.totalDays, 0);

    // Track absence days (sick, emergency, unpaid) separately without deducting from holiday allowance
    const absenceDaysThisYear = thisYearRequests
      .filter((r) => r.status === 'approved' && r.leaveType !== 'annual')
      .reduce((sum, r) => sum + r.totalDays, 0);

    return {
      entitlement: {
        annualTotal: 28,
        approvedDays: approvedAnnualDays,
        pendingDays: pendingAnnualDays,
        remainingDays: Math.max(0, 28 - approvedAnnualDays),
        absenceDaysThisYear,
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

  /**
   * Comprehensive Employee Earnings & Financial Ledger
   */
  async getEarnings(companyId: string, user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(companyId, user);

    // 1. Fetch employee's active assignment for baseline contracted rate
    const assignment = await this.db.findActiveAssignmentByEmployeeId(companyId, employee.id);
    const hourlyRate = assignment?.payRate
      ? Number(assignment.payRate)
      : (assignment as any)?.siteJob?.defaultPayRate
      ? Number((assignment as any).siteJob.defaultPayRate)
      : 15.0;

    // 2. Auto-sync current pay-period timesheet so latest completed shifts reflect immediately
    if (this.timesheetsService) {
      try {
        await this.timesheetsService.syncEmployeeTimesheetForPeriod(companyId, employee.id, new Date());
      } catch (syncErr: any) {
        this.logger.warn(`Could not sync weekly timesheet for employee ${employee.id}: ${syncErr.message}`);
      }
    }

    // 3. Fetch timesheets
    const timesheets = await this.db.findTimesheets(companyId, {
      employeeId: employee.id,
    });

    // 4. Fetch payslips
    const payslips = await this.db.findPayslips(companyId, {
      employeeId: employee.id,
    });

    // 5. Fetch recent attendance records
    const recentAttendance = await this.attendanceService.findAll(companyId, {
      employeeId: employee.id,
    });

    const attendanceList = Array.isArray(recentAttendance)
      ? recentAttendance
      : (recentAttendance as any)?.items || [];

    // Sum completed attendance not yet finalized into locked timesheets
    const unapprovedAttendance = attendanceList.filter(
      (a: any) => a.clockOutTime && a.status !== 'rejected' && a.totalHours > 0
    );

    // Check for ongoing active shift (clocked_in or on_break)
    const activePunch = attendanceList.find(
      (a: any) => a.status === 'clocked_in' || a.status === 'on_break'
    );

    let activeDutyHours = 0;
    let activeShift: any = null;

    if (activePunch && activePunch.clockInTime) {
      const now = Date.now();
      const clockInMs = new Date(activePunch.clockInTime).getTime();
      let breakMins = activePunch.breakMinutes || 0;
      if (activePunch.status === 'on_break' && activePunch.breakStartTime) {
        breakMins += Math.round((now - new Date(activePunch.breakStartTime).getTime()) / 60000);
      }
      const grossHours = Math.max(0, (now - clockInMs) / 3600000);
      activeDutyHours = Math.max(0, Math.round((grossHours - breakMins / 60) * 100) / 100);
      const shiftEstPay = Math.round(activeDutyHours * hourlyRate * 100) / 100;

      activeShift = {
        id: activePunch.id,
        siteId: activePunch.siteId,
        siteName: activePunch.site?.name || 'Assigned Site',
        clockInTime: activePunch.clockInTime,
        status: activePunch.status,
        elapsedHours: activeDutyHours,
        breakMinutes: breakMins,
        estimatedEarnings: shiftEstPay,
        hourlyRate,
        isActiveDuty: true,
      };
    }

    // Approved gross earnings from timesheets
    const approvedTimesheets = timesheets.filter((t) => t.status === 'approved' || t.status === 'locked');
    const approvedGrossEarnings = approvedTimesheets.reduce((sum, t) => sum + (Number(t.grossPay) || 0), 0);
    const approvedTotalHours = approvedTimesheets.reduce((sum, t) => sum + (Number(t.totalHours) || 0), 0);

    // Total disbursements received (paid payslips)
    const paidPayslips = payslips.filter((p) => p.status === 'paid');
    const totalNetPaid = paidPayslips.reduce((sum, p) => sum + (Number(p.netPay) || 0), 0);
    const totalGrossPaid = paidPayslips.reduce((sum, p) => sum + (Number(p.grossPay) || 0), 0);

    // In-progress / estimated unapproved hours and earnings (including live active duty!)
    const completedPendingHours = unapprovedAttendance.reduce((sum: number, a: any) => sum + (Number(a.totalHours) || 0), 0);
    const pendingHours = Math.round((completedPendingHours + activeDutyHours) * 10) / 10;
    const estimatedGrossWages = Math.round(pendingHours * hourlyRate * 100) / 100;

    // Outstanding approved gross balance awaiting disbursement
    const outstandingApproved = Math.max(0, Math.round((approvedGrossEarnings - totalGrossPaid) * 100) / 100);

    // Combine active shift at the top of recent unbilled shifts
    const recentUnbilled = activeShift
      ? [
          {
            ...activePunch,
            clockOutTime: null,
            totalHours: activeShift.elapsedHours,
            breakMinutes: activeShift.breakMinutes,
            status: activeShift.status,
            isActiveDuty: true,
          },
          ...unapprovedAttendance.filter((a: any) => a.id !== activeShift.id),
        ]
      : unapprovedAttendance;

    // In timesheets list:
    // Filter out historical draft placeholders with 0 hours from past weeks,
    // so employee only sees timesheets with hours worked, approved ones, or current active week.
    const todayStr = new Date().toISOString().split('T')[0];
    const displayTimesheets = (timesheets || []).filter((ts) => {
      if (ts.status === 'approved' || ts.status === 'locked') return true;
      if (Number(ts.totalHours) > 0) return true;
      if (ts.periodStart <= todayStr && ts.periodEnd >= todayStr) return true;
      return false;
    });

    return {
      currency: 'GBP',
      summary: {
        contractedHourlyRate: hourlyRate,
        estimatedGrossWages,
        pendingHours,
        approvedGrossEarnings: Math.round(approvedGrossEarnings * 100) / 100,
        approvedTotalHours: Math.round(approvedTotalHours * 10) / 10,
        totalNetPaid: Math.round(totalNetPaid * 100) / 100,
        totalGrossPaid: Math.round(totalGrossPaid * 100) / 100,
        outstandingApproved,
      },
      activeShift,
      timesheets: displayTimesheets,
      payslips: payslips || [],
      recentUnbilledShifts: recentUnbilled.slice(0, 10),
    };
  }

  /**
   * Generates a monthly day-by-day attendance register for the authenticated employee.
   * Shows every calendar day of `month` (e.g. '2026-10'): Present (hours), Absent, Leave, or Off.
   */
  async getMyAttendanceSheet(companyId: string, user: AuthenticatedUser, monthStr?: string) {
    const employee = await this.getEmployeeForUser(companyId, user);
    const targetMonth = monthStr || new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const [year, month] = targetMonth.split('-').map(Number);

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const totalDays = lastDay.getDate();

    const startDate = firstDay.toISOString().split('T')[0];
    const endDate = lastDay.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Fetch employee's attendance records for the month
    const attendanceRecords = await this.attendanceService.findAll(companyId, {
      employeeId: employee.id,
      startDate,
      endDate,
    });
    const attList = Array.isArray(attendanceRecords)
      ? attendanceRecords
      : (attendanceRecords as any)?.items || [];

    // 2. Fetch employee's approved leave
    let leaves: any[] = [];
    try {
      const leavesResult = await this.leaveService.findAll(companyId, {
        employeeId: employee.id,
        status: 'approved',
      });
      leaves = (leavesResult as any)?.items || leavesResult || [];
    } catch {}

    // 3. Build each day of the month
    const days: any[] = [];
    let daysPresent = 0;
    let daysAbsent = 0;
    let daysLeave = 0;
    let daysOnDuty = 0;
    let totalHoursWorked = 0;

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month - 1, day);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
      const isPastOrToday = dateStr <= todayStr;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      const att = attList.find((a: any) => {
        const inDate = a.clockInTime ? new Date(a.clockInTime).toISOString().split('T')[0] : '';
        const outDate = a.clockOutTime ? new Date(a.clockOutTime).toISOString().split('T')[0] : '';
        const isActive = a.status === 'clocked_in' || a.status === 'on_break';
        if (isActive) {
          return inDate === dateStr || dateStr === todayStr;
        }
        return outDate === dateStr || inDate === dateStr;
      });

      const leave = leaves.find((l: any) => l.startDate <= dateStr && l.endDate >= dateStr);

      let status: 'present' | 'on_duty' | 'absent' | 'leave' | 'off' | 'future' = 'off';
      let hours = 0;
      let clockIn: string | null = null;
      let clockOut: string | null = null;

      if (att) {
        clockIn = new Date(att.clockInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        if (att.status === 'clocked_in' || att.status === 'on_break') {
          status = 'on_duty';
          daysOnDuty++;
          const now = Date.now();
          const gross = Math.max(0, (now - new Date(att.clockInTime).getTime()) / 3600000);
          hours = Math.max(0, Math.round((gross - (att.breakMinutes || 0) / 60) * 100) / 100);
        } else {
          status = 'present';
          daysPresent++;
          clockOut = att.clockOutTime ? new Date(att.clockOutTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
          hours = Number(att.totalHours) || 0;
        }
        totalHoursWorked += hours;
      } else if (leave) {
        status = 'leave';
        daysLeave++;
      } else if (!isPastOrToday) {
        status = 'future';
      } else if (!isWeekend) {
        status = 'absent';
        daysAbsent++;
      } else {
        status = 'off';
      }

      days.push({
        date: dateStr,
        dayNumber: day,
        dayName,
        status,
        clockIn,
        clockOut,
        hours,
        siteName: att?.site?.name || null,
      });
    }

    return {
      month: targetMonth,
      summary: {
        totalDays,
        daysPresent,
        daysAbsent,
        daysOnDuty,
        daysLeave,
        totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
      },
      days: days.sort((a, b) => b.dayNumber - a.dayNumber),
    };
  }
}
