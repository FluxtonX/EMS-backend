import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  DatabaseService,
  LeaveRequestEntity,
  LeaveStatus,
} from '../../database/database.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly notificationsService?: NotificationsService
  ) {}

  private calculateWorkingDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 0;
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const dow = current.getDay();
      if (dow !== 0 && dow !== 6) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  async createLeaveRequest(
    companyId: string,
    dto: CreateLeaveRequestDto,
    requestingUserId: string
  ): Promise<LeaveRequestEntity> {
    // Validate employee belongs to company
    const employee = await this.db.findEmployeeById(companyId, dto.employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }
    if (employee.employmentStatus === 'terminated') {
      throw new BadRequestException('Cannot submit leave for a terminated employee');
    }

    // Validate dates
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) {
      throw new BadRequestException('End date must be on or after start date');
    }

    // Check for overlapping pending/approved leave
    const existing = await this.db.findLeaveRequests(companyId, {
      employeeId: dto.employeeId,
    });
    const conflict = existing.find((lr) => {
      if (lr.status === 'cancelled' || lr.status === 'rejected') return false;
      const existStart = new Date(lr.startDate);
      const existEnd = new Date(lr.endDate);
      return start <= existEnd && end >= existStart;
    });
    if (conflict) {
      throw new BadRequestException(
        `Overlapping leave request exists (${conflict.startDate} → ${conflict.endDate}, status: ${conflict.status})`
      );
    }

    const totalDays = this.calculateWorkingDays(dto.startDate, dto.endDate);
    if (totalDays === 0) {
      throw new BadRequestException('No working days in the selected date range');
    }

    const leave = await this.db.createLeaveRequest(companyId, {
      employeeId: dto.employeeId,
      leaveType: dto.leaveType,
      startDate: dto.startDate,
      endDate: dto.endDate,
      totalDays,
      reason: dto.reason,
      status: 'pending',
    });

    this.logger.log(`Leave request created: ${leave.id} for employee ${dto.employeeId}`);
    return leave;
  }

  async findAll(
    companyId: string,
    filters: QueryLeaveRequestsDto
  ) {
    return this.db.findLeaveRequests(companyId, {
      employeeId: filters.employeeId,
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
  }

  async findOne(companyId: string, id: string): Promise<LeaveRequestEntity> {
    const leave = await this.db.findLeaveRequestById(companyId, id);
    if (!leave) throw new NotFoundException(`Leave request ${id} not found`);
    return leave;
  }

  async reviewLeaveRequest(
    companyId: string,
    id: string,
    dto: ReviewLeaveRequestDto,
    reviewerUserId: string
  ): Promise<LeaveRequestEntity> {
    const leave = await this.findOne(companyId, id);
    if (leave.status !== 'pending') {
      throw new BadRequestException(
        `Cannot review leave request with status '${leave.status}'. Only pending requests can be reviewed.`
      );
    }

    const updated = await this.db.updateLeaveRequest(companyId, id, {
      status: dto.status as LeaveStatus,
      reviewedBy: reviewerUserId,
      reviewedAt: new Date(),
      reviewNotes: dto.reviewNotes,
    });

    if (!updated) throw new NotFoundException(`Leave request ${id} not found`);
    this.logger.log(`Leave request ${id} ${dto.status} by user ${reviewerUserId}`);

    if (this.notificationsService) {
      this.notificationsService
        .notifyLeaveDecision(
          companyId,
          leave.employeeId,
          dto.status as 'approved' | 'rejected',
          leave.leaveType,
          leave.startDate,
          leave.endDate,
          dto.reviewNotes
        )
        .catch((err) => this.logger.error(`Error notifying leave decision: ${err.message}`));
    }

    return updated;
  }

  async cancelLeaveRequest(
    companyId: string,
    id: string,
    requestingEmployeeId?: string
  ): Promise<LeaveRequestEntity> {
    const leave = await this.findOne(companyId, id);
    if (leave.status === 'cancelled') {
      throw new BadRequestException('Leave request is already cancelled');
    }
    if (leave.status === 'approved') {
      // Only allow cancellation of future approved leave
      const today = new Date().toISOString().split('T')[0];
      if (leave.startDate <= today) {
        throw new BadRequestException(
          'Cannot cancel a leave request that has already started'
        );
      }
    }
    if (requestingEmployeeId && leave.employeeId !== requestingEmployeeId) {
      throw new ForbiddenException('You can only cancel your own leave requests');
    }

    const updated = await this.db.cancelLeaveRequest(companyId, id);
    if (!updated) throw new NotFoundException(`Leave request ${id} not found`);
    return updated;
  }

  async getLeaveStats(companyId: string, employeeId: string) {
    const requests = await this.db.findLeaveRequests(companyId, { employeeId });
    const currentYear = new Date().getFullYear();
    const thisYear = requests.filter(
      (r) => new Date(r.startDate).getFullYear() === currentYear
    );

    return {
      totalRequests: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
      daysUsedThisYear: thisYear
        .filter((r) => r.status === 'approved')
        .reduce((sum, r) => sum + r.totalDays, 0),
    };
  }
}
