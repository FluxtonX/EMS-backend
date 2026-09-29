import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DatabaseService, ShiftEntity, ShiftStatus } from '../../database/database.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { QueryShiftsDto, QueryEligibleEmployeesDto } from './dto/query-shifts.dto';

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async create(companyId: string, dto: CreateShiftDto, userId?: string) {
    // 1. Verify Site
    const site = await this.databaseService.findSiteById(companyId, dto.siteId);
    if (!site) {
      throw new NotFoundException(`Site with ID ${dto.siteId} not found`);
    }

    // 2. Verify SiteJob
    const siteJob = await this.databaseService.findSiteJobById(companyId, dto.siteJobId);
    if (!siteJob || siteJob.siteId !== dto.siteId) {
      throw new NotFoundException(`Job Role with ID ${dto.siteJobId} not found for this site`);
    }

    // 3. Time validation
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('End time must be strictly after start time');
    }

    // 4. Employee Conflict Check (if employee is assigned)
    if (dto.employeeId) {
      const employee = await this.databaseService.findEmployeeById(companyId, dto.employeeId);
      if (!employee) {
        throw new NotFoundException(`Employee with ID ${dto.employeeId} not found`);
      }
      if (employee.employmentStatus !== 'active') {
        throw new BadRequestException(`Employee is not active (status: ${employee.employmentStatus})`);
      }

      // Check conflict overlap
      const conflicts = await this.databaseService.findConflictingShifts(
        companyId,
        dto.employeeId,
        dto.shiftDate,
        dto.startTime,
        dto.endTime
      );

      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        throw new ConflictException(
          `Shift conflict detected: Employee already scheduled for shift ${conflict.startTime} - ${conflict.endTime} on ${dto.shiftDate}`
        );
      }
    }

    // 5. Create Shift
    const shift = await this.databaseService.createShift({
      companyId,
      siteId: dto.siteId,
      siteJobId: dto.siteJobId,
      employeeId: dto.employeeId || undefined,
      shiftDate: dto.shiftDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      breakMinutes: dto.breakMinutes || 0,
      status: 'scheduled',
      notes: dto.notes,
    });

    // 6. Audit Log
    await this.databaseService.recordAudit({
      companyId,
      userId,
      action: 'shift.created',
      entity: 'shift',
      entityId: shift.id,
      newValue: {
        siteId: shift.siteId,
        siteJobId: shift.siteJobId,
        employeeId: shift.employeeId,
        shiftDate: shift.shiftDate,
        time: `${shift.startTime}-${shift.endTime}`,
        status: shift.status,
      },
    });

    return this.findById(companyId, shift.id);
  }

  async findAll(companyId: string, query: QueryShiftsDto) {
    return this.databaseService.findShifts(companyId, query);
  }

  async findById(companyId: string, id: string) {
    const shift = await this.databaseService.findShiftById(companyId, id);
    if (!shift) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }

    const site = await this.databaseService.findSiteById(companyId, shift.siteId);
    const siteJob = await this.databaseService.findSiteJobById(companyId, shift.siteJobId);
    let jobType;
    if (siteJob) {
      jobType = await this.databaseService.findJobTypeById(companyId, siteJob.jobTypeId);
    }

    let employee;
    if (shift.employeeId) {
      employee = await this.databaseService.findEmployeeById(companyId, shift.employeeId);
    }

    return {
      ...shift,
      site,
      siteJob: siteJob && jobType ? { ...siteJob, jobType } : siteJob,
      employee,
    };
  }

  async update(companyId: string, id: string, dto: UpdateShiftDto, userId?: string) {
    const existing = await this.databaseService.findShiftById(companyId, id);
    if (!existing) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }

    const targetDate = dto.shiftDate || existing.shiftDate;
    const targetStart = dto.startTime || existing.startTime;
    const targetEnd = dto.endTime || existing.endTime;

    if (targetStart >= targetEnd) {
      throw new BadRequestException('End time must be strictly after start time');
    }

    // Determine target employee
    const targetEmployeeId =
      dto.employeeId !== undefined
        ? dto.employeeId === null
          ? undefined
          : dto.employeeId
        : existing.employeeId;

    // Conflict check if employee is assigned
    if (targetEmployeeId) {
      const employee = await this.databaseService.findEmployeeById(companyId, targetEmployeeId);
      if (!employee) {
        throw new NotFoundException(`Employee with ID ${targetEmployeeId} not found`);
      }
      if (employee.employmentStatus !== 'active') {
        throw new BadRequestException(`Employee is not active (status: ${employee.employmentStatus})`);
      }

      const conflicts = await this.databaseService.findConflictingShifts(
        companyId,
        targetEmployeeId,
        targetDate,
        targetStart,
        targetEnd,
        id // exclude current shift
      );

      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        throw new ConflictException(
          `Shift conflict detected: Employee already scheduled for shift ${conflict.startTime} - ${conflict.endTime} on ${targetDate}`
        );
      }
    }

    const updated = await this.databaseService.updateShift(companyId, id, {
      employeeId: targetEmployeeId,
      shiftDate: targetDate,
      startTime: targetStart,
      endTime: targetEnd,
      breakMinutes: dto.breakMinutes !== undefined ? dto.breakMinutes : existing.breakMinutes,
      status: dto.status || existing.status,
      notes: dto.notes !== undefined ? dto.notes : existing.notes,
    });

    await this.databaseService.recordAudit({
      companyId,
      userId,
      action: 'shift.updated',
      entity: 'shift',
      entityId: id,
      oldValue: {
        employeeId: existing.employeeId,
        shiftDate: existing.shiftDate,
        startTime: existing.startTime,
        endTime: existing.endTime,
        status: existing.status,
      },
      newValue: {
        employeeId: updated?.employeeId,
        shiftDate: updated?.shiftDate,
        startTime: updated?.startTime,
        endTime: updated?.endTime,
        status: updated?.status,
      },
    });

    return this.findById(companyId, id);
  }

  async delete(companyId: string, id: string, userId?: string) {
    const existing = await this.databaseService.findShiftById(companyId, id);
    if (!existing) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }

    if (existing.status === 'in_progress') {
      throw new BadRequestException('Cannot delete an in-progress shift. Please cancel it instead.');
    }

    const success = await this.databaseService.deleteShift(companyId, id);
    if (!success) {
      throw new NotFoundException(`Shift with ID ${id} could not be deleted`);
    }

    await this.databaseService.recordAudit({
      companyId,
      userId,
      action: 'shift.deleted',
      entity: 'shift',
      entityId: id,
      oldValue: {
        shiftDate: existing.shiftDate,
        startTime: existing.startTime,
        endTime: existing.endTime,
        employeeId: existing.employeeId,
      },
    });

    return { success: true, message: 'Shift deleted successfully' };
  }

  async getEligibleEmployees(companyId: string, query: QueryEligibleEmployeesDto) {
    const { siteId, siteJobId, shiftDate, startTime, endTime } = query;

    // Find all active employees in this company
    const { items } = await this.databaseService.findEmployees(companyId, { status: 'active', limit: 100 });

    const eligibleList: Array<{
      employee: {
        id: string;
        firstName: string;
        lastName: string;
        employeeNumber: string;
      };
      hasActiveAssignment: boolean;
      isAssignedToThisSite: boolean;
      isAssignedToThisJob: boolean;
      assignedPayRate: number | null;
      hasConflict: boolean;
      conflictDetails: string | null;
      isEligible: boolean;
    }> = [];

    for (const emp of items) {
      // Check active assignment
      const activeAssignment = await this.databaseService.findActiveAssignmentByEmployeeId(
        companyId,
        emp.id
      );

      // Check if employee has an active assignment for this specific siteJob or site
      const isAssignedToThisSite = activeAssignment?.siteJob?.siteId === siteId;
      const isAssignedToThisJob = activeAssignment?.siteJobId === siteJobId;

      // Check shift conflict
      const conflicts = await this.databaseService.findConflictingShifts(
        companyId,
        emp.id,
        shiftDate,
        startTime,
        endTime
      );

      const hasConflict = conflicts.length > 0;

      eligibleList.push({
        employee: {
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          employeeNumber: emp.employeeNumber,
        },
        hasActiveAssignment: !!activeAssignment,
        isAssignedToThisSite,
        isAssignedToThisJob,
        assignedPayRate: activeAssignment ? activeAssignment.payRate : null,
        hasConflict,
        conflictDetails: hasConflict ? `${conflicts[0].startTime} - ${conflicts[0].endTime}` : null,
        isEligible: !hasConflict,
      });
    }

    // Sort: eligible first, then assigned to this site/job, then by name
    return eligibleList.sort((a, b) => {
      if (a.isEligible !== b.isEligible) {
        return a.isEligible ? -1 : 1;
      }
      if (a.isAssignedToThisJob !== b.isAssignedToThisJob) {
        return a.isAssignedToThisJob ? -1 : 1;
      }
      return a.employee.lastName.localeCompare(b.employee.lastName);
    });
  }
}
