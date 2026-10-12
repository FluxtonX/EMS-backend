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
    @Optional() private readonly notificationsService?: NotificationsService
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
      if (clockInDistance > radius) {
        clockInVerified = false;
        varianceFlag = 'out_of_geofence';
        this.logger.warn(
          `Out-of-geofence clock-in: Employee ${employee.employeeNumber} is ${clockInDistance}m from site (max: ${radius}m)`
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
      if (clockOutDistance > radius) {
        clockOutVerified = false;
        this.logger.warn(`Out-of-geofence clock-out: ${clockOutDistance}m from site`);
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
}
