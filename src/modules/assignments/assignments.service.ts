import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DatabaseService, AssignmentEntity } from '../../database/database.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { TransferAssignmentDto, CloseAssignmentDto } from './dto/transfer-assignment.dto';

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(private readonly db: DatabaseService) {}

  async create(companyId: string, dto: CreateAssignmentDto, userId?: string) {
    // 1. Validate employee exists and belongs to company
    const employee = await this.db.findEmployeeById(companyId, dto.employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${dto.employeeId} not found.`);
    }

    // 2. Validate destination site job exists and belongs to company
    const siteJob = await this.db.findSiteJobById(companyId, dto.siteJobId);
    if (!siteJob) {
      throw new NotFoundException(`Site Job role configuration with ID ${dto.siteJobId} not found.`);
    }

    if (siteJob.status !== 'active') {
      throw new BadRequestException('Cannot assign an employee to an inactive site job role.');
    }

    // 3. Date validation
    if (dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException('Assignment end date cannot be earlier than start date.');
    }

    // 4. Check for existing active assignment
    const activeAssignment = await this.db.findActiveAssignmentByEmployeeId(companyId, dto.employeeId);
    if (activeAssignment) {
      throw new ConflictException(
        `Employee already has an active assignment at ${activeAssignment.siteJob.site.name}. Use the transfer flow to reassign with historical tracking.`
      );
    }

    // 5. Lock historical pay rate
    const agreedRate =
      dto.payRate !== undefined && dto.payRate > 0 ? dto.payRate : siteJob.defaultPayRate;

    // 6. Create assignment
    const assignment = await this.db.createAssignment({
      companyId,
      employeeId: dto.employeeId,
      siteJobId: dto.siteJobId,
      payRate: agreedRate,
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: 'active',
    });

    // 7. Audit log
    await this.db.recordAudit({
      companyId,
      userId,
      action: 'assignment.create',
      entity: 'assignment',
      entityId: assignment.id,
      newValue: {
        employeeId: dto.employeeId,
        siteJobId: dto.siteJobId,
        lockedPayRate: agreedRate,
        startDate: dto.startDate,
      },
    });

    this.logger.log(
      `Assigned Employee ${employee.employeeNumber} to SiteJob ${siteJob.id} at locked rate £${agreedRate}/hr.`
    );

    return assignment;
  }

  async findAll(companyId: string, options?: { siteId?: string; status?: string }) {
    return this.db.findCompanyAssignments(companyId, options);
  }

  async getEmployeeAssignments(companyId: string, employeeId: string) {
    const employee = await this.db.findEmployeeById(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found.`);
    }
    return this.db.findAssignmentsByEmployeeId(companyId, employeeId);
  }

  async getActiveAssignment(companyId: string, employeeId: string) {
    const employee = await this.db.findEmployeeById(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found.`);
    }
    return this.db.findActiveAssignmentByEmployeeId(companyId, employeeId);
  }

  async transfer(companyId: string, employeeId: string, dto: TransferAssignmentDto, userId?: string) {
    // 1. Verify employee exists
    const employee = await this.db.findEmployeeById(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found.`);
    }

    // 2. Identify current active assignment
    const activeAssignment = await this.db.findActiveAssignmentByEmployeeId(companyId, employeeId);
    if (!activeAssignment) {
      throw new BadRequestException(
        `Cannot transfer employee ${employee.employeeNumber}: No active assignment exists. Create an initial assignment first.`
      );
    }

    // 3. Verify destination site job
    const newSiteJob = await this.db.findSiteJobById(companyId, dto.newSiteJobId);
    if (!newSiteJob) {
      throw new NotFoundException(`Target Site Job role with ID ${dto.newSiteJobId} not found.`);
    }

    if (newSiteJob.status !== 'active') {
      throw new BadRequestException('Target site job role is inactive.');
    }

    // 4. Verify dates
    if (new Date(dto.transferDate) < new Date(activeAssignment.startDate)) {
      throw new BadRequestException(
        `Transfer effective date (${dto.transferDate}) cannot be earlier than current assignment start date (${activeAssignment.startDate}).`
      );
    }

    // Determine locked rate for new assignment
    const newAgreedRate =
      dto.newPayRate !== undefined && dto.newPayRate > 0
        ? dto.newPayRate
        : newSiteJob.defaultPayRate;

    // --- ATOMIC TRANSFER TRANSACTION (Section 38 & 51) ---
    // A. Terminate previous assignment with status 'transferred'
    const closedAssignment = await this.db.closeAssignment(
      companyId,
      activeAssignment.id,
      dto.transferDate,
      'transferred'
    );

    // B. Spawn new assignment with locked rate and new start date
    const newAssignment = await this.db.createAssignment({
      companyId,
      employeeId,
      siteJobId: dto.newSiteJobId,
      payRate: newAgreedRate,
      startDate: dto.transferDate,
      status: 'active',
    });

    // C. Record comprehensive audit log
    await this.db.recordAudit({
      companyId,
      userId,
      action: 'assignment.transfer',
      entity: 'assignment',
      entityId: newAssignment.id,
      oldValue: {
        assignmentId: activeAssignment.id,
        siteId: activeAssignment.siteJob.site.id,
        siteName: activeAssignment.siteJob.site.name,
        role: activeAssignment.siteJob.jobType.name,
        historicalPayRate: activeAssignment.payRate,
        endDate: dto.transferDate,
      },
      newValue: {
        assignmentId: newAssignment.id,
        siteJobId: dto.newSiteJobId,
        newLockedPayRate: newAgreedRate,
        startDate: dto.transferDate,
        reason: dto.reason,
      },
    });

    this.logger.log(
      `[ATOMIC TRANSFER] Employee ${employee.employeeNumber} transferred from ${activeAssignment.siteJob.site.name} (£${activeAssignment.payRate}/hr) to new site job ${newSiteJob.id} (£${newAgreedRate}/hr).`
    );

    return {
      previousAssignment: closedAssignment,
      newAssignment,
    };
  }

  async close(companyId: string, id: string, dto: CloseAssignmentDto, userId?: string) {
    const assignment = await this.db.findAssignmentById(companyId, id);
    if (!assignment) {
      throw new NotFoundException(`Assignment with ID ${id} not found.`);
    }

    if (assignment.status !== 'active') {
      throw new BadRequestException(`Assignment is already in '${assignment.status}' state.`);
    }

    if (new Date(dto.endDate) < new Date(assignment.startDate)) {
      throw new BadRequestException('Closing end date cannot precede assignment start date.');
    }

    const closed = await this.db.closeAssignment(companyId, id, dto.endDate, 'completed');

    await this.db.recordAudit({
      companyId,
      userId,
      action: 'assignment.close',
      entity: 'assignment',
      entityId: id,
      oldValue: { status: 'active', endDate: assignment.endDate },
      newValue: { status: 'completed', endDate: dto.endDate, reason: dto.reason },
    });

    return closed;
  }
}
