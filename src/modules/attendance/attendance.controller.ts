import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { ReconcileAttendanceDto } from './dto/reconcile-attendance.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  @RequirePermissions(Permission.ATTENDANCE_CLOCK)
  @HttpCode(HttpStatus.CREATED)
  async clockIn(
    @TenantId() companyId: string,
    @Body() dto: ClockInDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.attendanceService.clockIn(companyId, dto, user?.id);
  }

  @Post(':id/break/start')
  @RequirePermissions(Permission.ATTENDANCE_CLOCK)
  @HttpCode(HttpStatus.OK)
  async startBreak(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.attendanceService.startBreak(companyId, id, user?.id);
  }

  @Post(':id/break/end')
  @RequirePermissions(Permission.ATTENDANCE_CLOCK)
  @HttpCode(HttpStatus.OK)
  async endBreak(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.attendanceService.endBreak(companyId, id, user?.id);
  }

  @Post(':id/clock-out')
  @RequirePermissions(Permission.ATTENDANCE_CLOCK)
  @HttpCode(HttpStatus.OK)
  async clockOut(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Body() dto: ClockOutDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.attendanceService.clockOut(companyId, id, dto, user?.id);
  }

  @Patch(':id/reconcile')
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  async reconcile(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Body() dto: ReconcileAttendanceDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.attendanceService.reconcile(companyId, id, dto, user?.id);
  }

  @Get()
  @RequirePermissions(Permission.ATTENDANCE_VIEW)
  async findAll(
    @TenantId() companyId: string,
    @Query() query: QueryAttendanceDto
  ) {
    return this.attendanceService.findAll(companyId, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.ATTENDANCE_VIEW)
  async findById(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.attendanceService.findById(companyId, id);
  }
}
