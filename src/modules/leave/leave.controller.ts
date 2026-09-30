import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@Controller('leave')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  /**
   * POST /api/v1/leave
   * Submit a new leave request. Requires LEAVE_REQUEST permission.
   */
  @Post()
  @RequirePermissions(Permission.LEAVE_REQUEST)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @TenantId() companyId: string,
    @Body() dto: CreateLeaveRequestDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const leave = await this.leaveService.createLeaveRequest(companyId, dto, user.id);
    return { data: leave };
  }

  /**
   * GET /api/v1/leave
   * List leave requests. Managers/Admins see all; filtered by employee if needed.
   */
  @Get()
  @RequirePermissions(Permission.LEAVE_REQUEST)
  async findAll(
    @TenantId() companyId: string,
    @Query() query: QueryLeaveRequestsDto
  ) {
    const results = await this.leaveService.findAll(companyId, query);
    return { data: results };
  }

  /**
   * GET /api/v1/leave/:id
   * Get a single leave request by ID.
   */
  @Get(':id')
  @RequirePermissions(Permission.LEAVE_REQUEST)
  async findOne(@TenantId() companyId: string, @Param('id') id: string) {
    const leave = await this.leaveService.findOne(companyId, id);
    return { data: leave };
  }

  /**
   * GET /api/v1/leave/employee/:employeeId/stats
   * Get leave usage stats for a specific employee.
   */
  @Get('employee/:employeeId/stats')
  @RequirePermissions(Permission.LEAVE_REQUEST)
  async getStats(
    @TenantId() companyId: string,
    @Param('employeeId') employeeId: string
  ) {
    const stats = await this.leaveService.getLeaveStats(companyId, employeeId);
    return { data: stats };
  }

  /**
   * PATCH /api/v1/leave/:id/review
   * Approve or reject a leave request. Requires LEAVE_APPROVE permission.
   */
  @Patch(':id/review')
  @RequirePermissions(Permission.LEAVE_APPROVE)
  async review(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Body() dto: ReviewLeaveRequestDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const leave = await this.leaveService.reviewLeaveRequest(
      companyId,
      id,
      dto,
      user.id
    );
    return { data: leave };
  }

  /**
   * DELETE /api/v1/leave/:id
   * Cancel a leave request (employee cancels own, manager can cancel any).
   */
  @Delete(':id')
  @RequirePermissions(Permission.LEAVE_REQUEST)
  @HttpCode(HttpStatus.OK)
  async cancel(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const leave = await this.leaveService.cancelLeaveRequest(companyId, id);
    return { data: leave };
  }
}
