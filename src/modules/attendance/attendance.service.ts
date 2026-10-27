import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  DatabaseService,
  AttendanceEntity,
  AttendanceStatus,
  VarianceFlag,
  ShiftEntity,
} from '../../database/database.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { ReconcileAttendanceDto } from './dto/reconcile-attendance.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { calculateWorkingDays } from '../leave/leave.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TimesheetsService } from '../timesheets/timesheets.service';

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly timesheetsService?: TimesheetsService
  ) {}

  async clockIn(companyId: string, dto: ClockInDto, userId?: string) {
    // 1. Verify Employee
    const employee = await this.databaseService.findEmployeeById(companyId, dto.employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${dto.employeeId} not found`);
    }
    if (employee.employmentStatus !== 'active') {
      throw new BadRequestException(`Employee is not active (status: ${employee.employmentStatus})`);
    }

    // 2. Verify Site
    const site = await this.databaseService.findSiteById(companyId, dto.siteId);
    if (!site) {
      throw new NotFoundException(`Site with ID ${dto.siteId} not found`);
    }

    // 3. Ensure no existing active attendance
    const active = await this.databaseService.findActiveAttendanceByEmployee(
      companyId,
      dto.employeeId
    );
    if (active) {
      throw new ConflictException(
        `Employee is already clocked in (Attendance ID: ${active.id}). Clock out first.`
      );
    }

    // 4. Geofence Distance Calculation
    let clockInDistance: number | undefined = undefined;
    let clockInVerified = true;
    let varianceFlag: VarianceFlag = 'none';

    if (
      dto.latitude !== undefined &&
      dto.longitude !== undefined &&
      site.latitude !== undefined &&
      site.longitude !== undefined
    ) {
      clockInDistance = calculateDistanceMeters(
        dto.latitude,
        dto.longitude,
        site.latitude,
        site.longitude
      );
      const radius = site.geofenceRadius || 200;
      // Tolerant accuracy buffer for mobile GPS drift (up to 100m)
      const accuracyBuffer = Math.min(Math.max(0, dto.accuracy || 0), 100);
      const effectiveDistance = Math.max(0, clockInDistance - accuracyBuffer);
      if (effectiveDistance > radius) {
        clockInVerified = false;
        varianceFlag = 'out_of_geofence';
        this.logger.warn(
          `Out-of-geofence clock-in: Employee ${employee.employeeNumber} is ${clockInDistance}m from site (effective: ${effectiveDistance}m, max: ${radius}m)`
        );
      }
    }

    // 5. Shift Verification & Late Detection
    let shift: ShiftEntity | null = null;
    if (dto.shiftId) {
      shift = await this.databaseService.findShiftById(companyId, dto.shiftId);
      if (shift) {
        // Parse scheduled time vs now
        const now = new Date();
        const [shiftHour, shiftMinute] = shift.startTime.split(':').map(Number);
        const scheduledTime = new Date(shift.shiftDate);
        scheduledTime.setHours(shiftHour, shiftMinute, 0, 0);

        // Check if more than 15 minutes late
        const diffMinutes = (now.getTime() - scheduledTime.getTime()) / 60000;
        if (diffMinutes > 15 && varianceFlag === 'none') {
          varianceFlag = 'late_arrival';
        }

        // Update shift status to in_progress
        await this.databaseService.updateShift(companyId, shift.id, {
          status: 'in_progress',
        });
      }
    }

    // 6. Check for approved leave on the clock-in date and convert to active attendance
    const clockInDate = new Date();
    const todayUtc = clockInDate.toISOString().split('T')[0];
    const todayLondon = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(clockInDate);

    try {
      const activeLeaves = await this.databaseService.findLeaveRequests(companyId, {
        employeeId: dto.employeeId,
        status: 'approved',
      });

      const overlappingLeave = activeLeaves.find(
        (l) =>
          (l.startDate <= todayUtc && l.endDate >= todayUtc) ||
          (l.startDate <= todayLondon && l.endDate >= todayLondon)
      );

      if (overlappingLeave) {
        const leaveDay =
          overlappingLeave.startDate <= todayLondon && overlappingLeave.endDate >= todayLondon
            ? todayLondon
            : todayUtc;

        this.logger.log(
          `Employee ${employee.employeeNumber} checked in on approved leave date (${leaveDay}). Overriding leave request ${overlappingLeave.id} so it is counted as active attendance work day.`
        );

        if (overlappingLeave.startDate === overlappingLeave.endDate) {
          // Single-day leave: cancel it and mark it superseded so it is NOT counted in leave
          await this.databaseService.updateLeaveRequest(companyId, overlappingLeave.id, {
            status: 'cancelled',
            reviewNotes: `Superseded by employee check-in on ${leaveDay} (counted as worked attendance day).`,
          });
        } else if (overlappingLeave.startDate === leaveDay) {
          // First day of multi-day leave: move startDate to next day
          const s = new Date(overlappingLeave.startDate);
          s.setUTCDate(s.getUTCDate() + 1);
          const nextDayStr = s.toISOString().split('T')[0];
          const newTotalDays = Math.max(1, calculateWorkingDays(nextDayStr, overlappingLeave.endDate));
          await this.databaseService.updateLeaveRequest(companyId, overlappingLeave.id, {
            startDate: nextDayStr,
            totalDays: newTotalDays,
            reviewNotes:
              (overlappingLeave.reviewNotes ? overlappingLeave.reviewNotes + ' | ' : '') +
              `Day ${leaveDay} worked on-duty - converted to attendance.`,
          });
        } else if (overlappingLeave.endDate === leaveDay) {
          // Last day of multi-day leave: move endDate to previous day
          const e = new Date(overlappingLeave.endDate);
          e.setUTCDate(e.getUTCDate() - 1);
          const prevDayStr = e.toISOString().split('T')[0];
          const newTotalDays = Math.max(1, calculateWorkingDays(overlappingLeave.startDate, prevDayStr));
          await this.databaseService.updateLeaveRequest(companyId, overlappingLeave.id, {
            endDate: prevDayStr,
            totalDays: newTotalDays,
            reviewNotes:
              (overlappingLeave.reviewNotes ? overlappingLeave.reviewNotes + ' | ' : '') +
              `Day ${leaveDay} worked on-duty - converted to attendance.`,
          });
        } else {
          // Middle day of multi-day leave: decrement 1 working day
          const newTotalDays = Math.max(1, overlappingLeave.totalDays - 1);
          await this.databaseService.updateLeaveRequest(companyId, overlappingLeave.id, {
            totalDays: newTotalDays,
            reviewNotes:
              (overlappingLeave.reviewNotes ? overlappingLeave.reviewNotes + ' | ' : '') +
              `Day ${leaveDay} worked on-duty - converted to attendance.`,
          });
        }

        if (this.notificationsService) {
          this.notificationsService
            .create(
              companyId,
              {
                title: 'Attendance Recorded on Leave Day',
                message: `Employee ${employee.firstName} ${employee.lastName} checked in on ${leaveDay}. Scheduled leave was converted to active working attendance, preserving leave balance.`,
                type: 'leave_decision',
                priority: 'normal',
                actionUrl: '/attendance',
                metadata: {
                  employeeId: employee.id,
                  date: leaveDay,
                  convertedToAttendance: true,
                },
              },
              employee.email
            )
            .catch((err) =>
              this.logger.warn(`Failed to dispatch leave-attendance notification: ${err.message}`)
            );
        }
      }
    } catch (err: any) {
      this.logger.error(`Error processing leave override on clock-in: ${err.message}`);
    }

    // 7. Create Attendance Record
    const record = await this.databaseService.createAttendanceRecord({
      companyId,
      shiftId: dto.shiftId,
      employeeId: dto.employeeId,
      siteId: dto.siteId,
      clockInTime: new Date(),
      clockInLat: dto.latitude,
      clockInLng: dto.longitude,
      clockInAccuracy: dto.accuracy,
      clockInDistance,
      clockInVerified,
      clockOutVerified: true,
      breakMinutes: 0,
      totalHours: 0,
      status: 'clocked_in',
      varianceFlag,
    });

    // 7. Audit Log
    await this.databaseService.recordAudit({
      companyId,
      userId,
      action: 'attendance.clock_in',
      entity: 'attendance_record',
      entityId: record.id,
      newValue: {
        employeeId: record.employeeId,
        siteId: record.siteId,
        shiftId: record.shiftId,
        clockInTime: record.clockInTime,
        clockInDistance,
        clockInVerified,
        varianceFlag,
      },
    });

    return this.findById(companyId, record.id);
  }

  async startBreak(companyId: string, id: string, userId?: string) {
    const record = await this.databaseService.findAttendanceById(companyId, id);
    if (!record) {
      throw new NotFoundException(`Attendance record with ID ${id} not found`);
    }
    if (record.status !== 'clocked_in') {
      throw new BadRequestException(
        `Cannot start break when status is ${record.status}. Must be clocked_in.`
      );
    }

    const updated = await this.databaseService.updateAttendanceRecord(companyId, id, {
      status: 'on_break',
      breakStartTime: new Date(),
    });

    await this.databaseService.recordAudit({
      companyId,
      userId,
      action: 'attendance.break_start',
      entity: 'attendance_record',
      entityId: id,
    });

    return updated;
  }

  async endBreak(companyId: string, id: string, userId?: string) {
    const record = await this.databaseService.findAttendanceById(companyId, id);
    if (!record) {
      throw new NotFoundException(`Attendance record with ID ${id} not found`);
    }
    if (record.status !== 'on_break') {
      throw new BadRequestException(
        `Cannot end break when status is ${record.status}. Must be on_break.`
      );
    }

    const now = new Date();
    const elapsedMinutes = record.breakStartTime
      ? Math.round((now.getTime() - record.breakStartTime.getTime()) / 60000)
      : 0;

    const totalBreakMinutes = record.breakMinutes + elapsedMinutes;

    const updated = await this.databaseService.updateAttendanceRecord(companyId, id, {
      status: 'clocked_in',
      breakEndTime: now,
      breakMinutes: totalBreakMinutes,
    });

    await this.databaseService.recordAudit({
      companyId,
      userId,
      action: 'attendance.break_end',
      entity: 'attendance_record',
      entityId: id,
      newValue: { breakMinutes: totalBreakMinutes },
    });

    return updated;
  }

  async clockOut(companyId: string, id: string, dto: ClockOutDto, userId?: string) {
    const record = await this.databaseService.findAttendanceById(companyId, id);
    if (!record) {
      throw new NotFoundException(`Attendance record with ID ${id} not found`);
    }
    if (record.status !== 'clocked_in' && record.status !== 'on_break') {
      throw new BadRequestException(
        `Cannot clock out from status ${record.status}. Must be clocked_in or on_break.`
      );
    }

    const site = await this.databaseService.findSiteById(companyId, record.siteId);

    // Geofence check on clock out
    let clockOutDistance: number | undefined = undefined;
    let clockOutVerified = true;

    if (
      dto.latitude !== undefined &&
      dto.longitude !== undefined &&
      site?.latitude !== undefined &&
      site?.longitude !== undefined
    ) {
      clockOutDistance = calculateDistanceMeters(
        dto.latitude,
        dto.longitude,
        site.latitude,
        site.longitude
      );
      const radius = site.geofenceRadius || 200;
      const accuracyBuffer = Math.min(Math.max(0, dto.accuracy || 0), 100);
      const effectiveDistance = Math.max(0, clockOutDistance - accuracyBuffer);
      if (effectiveDistance > radius) {
        clockOutVerified = false;
        this.logger.warn(`Out-of-geofence clock-out: ${clockOutDistance}m from site (effective: ${effectiveDistance}m)`);
      }
    }

    const now = new Date();

    // If on break when clocking out, close break duration
    let breakMinutes = record.breakMinutes;
    if (record.status === 'on_break' && record.breakStartTime) {
      breakMinutes += Math.round((now.getTime() - record.breakStartTime.getTime()) / 60000);
    }

    // Calculate total hours: (duration in ms / 3600000) - (breakMinutes / 60)
    const grossHours = (now.getTime() - record.clockInTime.getTime()) / 3600000;
    const netHours = Math.max(0, grossHours - breakMinutes / 60);
    const totalHours = Math.round(netHours * 100) / 100;

    let varianceFlag = record.varianceFlag;
    if (!clockOutVerified && varianceFlag === 'none') {
      varianceFlag = 'out_of_geofence';
    }

    // Check shift completion
    if (record.shiftId) {
      const shift = await this.databaseService.findShiftById(companyId, record.shiftId);
      if (shift) {
        await this.databaseService.updateShift(companyId, shift.id, {
          status: 'completed',
        });
      }
    }

    const updated = await this.databaseService.updateAttendanceRecord(companyId, id, {
      status: 'clocked_out',
      clockOutTime: now,
      clockOutLat: dto.latitude,
      clockOutLng: dto.longitude,
      clockOutAccuracy: dto.accuracy,
      clockOutDistance,
      clockOutVerified,
      breakMinutes,
      totalHours,
      varianceFlag,
    });

    await this.databaseService.recordAudit({
      companyId,
      userId,
      action: 'attendance.clock_out',
      entity: 'attendance_record',
      entityId: id,
      newValue: {
        clockOutTime: now,
        totalHours,
        breakMinutes,
        clockOutVerified,
        varianceFlag,
      },
    });

    // Auto-sync employee's pay-period timesheet so completed hours immediately populate
    if (this.timesheetsService) {
      try {
        await this.timesheetsService.syncEmployeeTimesheetForPeriod(
          companyId,
          record.employeeId,
          record.clockInTime || now
        );
      } catch (syncErr: any) {
        this.logger.warn(`Failed to auto-sync timesheet on clock-out: ${syncErr.message}`);
      }
    }

    return this.findById(companyId, id);
  }

  async reconcile(companyId: string, id: string, dto: ReconcileAttendanceDto, supervisorId?: string) {
    const record = await this.databaseService.findAttendanceById(companyId, id);
    if (!record) {
      throw new NotFoundException(`Attendance record with ID ${id} not found`);
    }

    const updates: Partial<AttendanceEntity> = {
      status: dto.status,
      supervisorNotes: dto.supervisorNotes,
      reconciledBy: supervisorId,
      reconciledAt: new Date(),
    };

    if (dto.adjustedTotalHours !== undefined) {
      updates.totalHours = dto.adjustedTotalHours;
    }
    if (dto.adjustedBreakMinutes !== undefined) {
      updates.breakMinutes = dto.adjustedBreakMinutes;
    }
    if (dto.varianceFlag !== undefined) {
      updates.varianceFlag = dto.varianceFlag;
    }

    const updated = await this.databaseService.updateAttendanceRecord(companyId, id, updates);

    await this.databaseService.recordAudit({
      companyId,
      userId: supervisorId,
      action: 'attendance.reconcile',
      entity: 'attendance_record',
      entityId: id,
      oldValue: {
        totalHours: record.totalHours,
        breakMinutes: record.breakMinutes,
        status: record.status,
        varianceFlag: record.varianceFlag,
      },
      newValue: {
        totalHours: updated?.totalHours,
        breakMinutes: updated?.breakMinutes,
        status: updated?.status,
        varianceFlag: updated?.varianceFlag,
        supervisorNotes: dto.supervisorNotes,
      },
    });

    // Auto-sync employee's pay-period timesheet on reconciliation
    if (this.timesheetsService) {
      try {
        await this.timesheetsService.syncEmployeeTimesheetForPeriod(
          companyId,
          record.employeeId,
          record.clockInTime || new Date()
        );
      } catch (syncErr: any) {
        this.logger.warn(`Failed to auto-sync timesheet on reconcile: ${syncErr.message}`);
      }
    }

    return this.findById(companyId, id);
  }

  async findAll(companyId: string, query: QueryAttendanceDto) {
    return this.databaseService.findAttendanceRecords(companyId, query);
  }

  async findById(companyId: string, id: string) {
    const record = await this.databaseService.findAttendanceById(companyId, id);
    if (!record) {
      throw new NotFoundException(`Attendance record with ID ${id} not found`);
    }

    const employee = await this.databaseService.findEmployeeById(companyId, record.employeeId);
    const site = await this.databaseService.findSiteById(companyId, record.siteId);
    let shift: ShiftEntity | undefined = undefined;
    if (record.shiftId) {
      const s = await this.databaseService.findShiftById(companyId, record.shiftId);
      if (s) shift = s;
    }

    return {
      ...record,
      employee,
      site,
      shift,
    };
  }

  /**
   * Generates a comprehensive Daily Attendance Register for a given date.
   * Cross-references:
   * 1. Active Employees
   * 2. Scheduled Shifts
   * 3. Clock-in / Clock-out Attendance Records
   * 4. Approved Leaves
   * Outputs full roster: Present, On Duty (live), Absent (no check-in), Leave, or Off.
   */
  async getDailySheet(
    companyId: string,
    query: { date?: string; siteId?: string }
  ) {
    const targetDate = query.date || new Date().toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    const isPastOrToday = targetDate <= todayStr;

    // 1. Fetch all company employees
    const employeesResult = await this.databaseService.findEmployees(companyId, {
      status: 'all',
      limit: 200,
    });
    const employees = employeesResult.items || [];

    // 2. Fetch attendance records for this date (including overnight & active)
    const attendanceRecords = await this.databaseService.findAttendanceRecords(companyId, {
      startDate: targetDate,
      endDate: targetDate,
      siteId: query.siteId && query.siteId !== 'all' ? query.siteId : undefined,
    });

    // 3. Fetch scheduled shifts for this date
    let shifts: ShiftEntity[] = [];
    try {
      shifts = await this.databaseService.findShifts(companyId, {
        startDate: targetDate,
        endDate: targetDate,
      });
    } catch {
      // Shift lookup fallback
    }

    // 4. Fetch approved leaves covering targetDate
    let leaves: any[] = [];
    try {
      const leavesResult = await this.databaseService.findLeaveRequests(companyId, {
        status: 'approved',
      });
      leaves = (leavesResult || []).filter(
        (l: any) => l.startDate <= targetDate && l.endDate >= targetDate
      );
    } catch {
      // Leave lookup fallback
    }

    // 5. Match each employee into the daily register
    const items = await Promise.all(
      employees.map(async (emp) => {
        // Attendance records on or touching targetDate
        const empAtts = (attendanceRecords || []).filter((a) => a.employeeId === emp.id);
        const att =
          empAtts.find((a) => a.status === 'clocked_in' || a.status === 'on_break') ||
          empAtts.find((a) => {
            const outDate = a.clockOutTime ? new Date(a.clockOutTime).toISOString().split('T')[0] : '';
            const inDate = a.clockInTime ? new Date(a.clockInTime).toISOString().split('T')[0] : '';
            return outDate === targetDate || inDate === targetDate;
          }) ||
          empAtts[0];

        // Shift assigned to this employee
        const shift = (shifts || []).find(
          (s) => s.employeeId === emp.id && (!query.siteId || query.siteId === 'all' || s.siteId === query.siteId)
        );

        // Active assignment (for default site)
        const assignment = await this.databaseService.findActiveAssignmentByEmployeeId(companyId, emp.id);
        const defaultSite = assignment?.siteJob?.siteId
          ? await this.databaseService.findSiteById(companyId, assignment.siteJob.siteId)
          : null;

        // Leave covering this date
        const leave = leaves.find((l) => l.employeeId === emp.id);

        // Determine status
        let status: 'present' | 'on_duty' | 'absent' | 'leave' | 'scheduled' | 'off' = 'off';
        let totalHours = 0;
        let clockInTime: Date | null = null;
        let clockOutTime: Date | null = null;
        let breakMinutes = 0;
        let varianceFlag: VarianceFlag = 'none';
        let site = (att as any)?.site || (shift as any)?.site || defaultSite || null;

        if (att) {
          clockInTime = att.clockInTime;
          clockOutTime = att.clockOutTime || null;
          breakMinutes = att.breakMinutes || 0;
          varianceFlag = att.varianceFlag || 'none';

          if (att.status === 'clocked_in' || att.status === 'on_break') {
            status = 'on_duty';
            const now = Date.now();
            const gross = Math.max(0, (now - new Date(att.clockInTime).getTime()) / 3600000);
            totalHours = Math.max(0, Math.round((gross - breakMinutes / 60) * 100) / 100);
          } else {
            status = 'present';
            totalHours = Number(att.totalHours) || 0;
          }
        } else if (leave) {
          status = 'leave';
        } else if (shift) {
          // Scheduled but no attendance record
          status = isPastOrToday ? 'absent' : 'scheduled';
        } else {
          // If active employee on a weekday and date is past or today, mark as absent if they didn't check in
          const dayOfWeek = new Date(targetDate).getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          if (isPastOrToday && !isWeekend) {
            status = 'absent';
          } else {
            status = 'off';
          }
        }

        // Daily overtime calculation: hours > 8.0
        const regularHours = Math.min(totalHours, 8.0);
        const overtimeHours = Math.max(0, Math.round((totalHours - 8.0) * 100) / 100);

        return {
          employeeId: emp.id,
          employee: {
            id: emp.id,
            employeeNumber: emp.employeeNumber,
            firstName: emp.firstName,
            lastName: emp.lastName,
            email: emp.email,
            phone: emp.phone,
          },
          site: site ? { id: site.id, name: site.name, code: site.code } : null,
          shift: shift
            ? {
                id: shift.id,
                startTime: shift.startTime,
                endTime: shift.endTime,
                status: shift.status,
              }
            : null,
          status,
          clockInTime,
          clockOutTime,
          breakMinutes,
          totalHours,
          regularHours,
          overtimeHours,
          varianceFlag,
          leaveReason: leave?.reason || null,
          attendanceRecordId: att?.id || null,
        };
      })
    );

    // Apply site filter if requested
    const filteredItems = query.siteId && query.siteId !== 'all'
      ? items.filter((item) => item.site?.id === query.siteId)
      : items;

    const presentCount = filteredItems.filter((i) => i.status === 'present').length;
    const onDutyCount = filteredItems.filter((i) => i.status === 'on_duty').length;
    const absentCount = filteredItems.filter((i) => i.status === 'absent').length;
    const onLeaveCount = filteredItems.filter((i) => i.status === 'leave').length;
    const offCount = filteredItems.filter((i) => i.status === 'off' || i.status === 'scheduled').length;

    return {
      date: targetDate,
      summary: {
        totalEmployees: filteredItems.length,
        presentCount,
        onDutyCount,
        absentCount,
        onLeaveCount,
        offCount,
      },
      items: filteredItems,
    };
  }
}
