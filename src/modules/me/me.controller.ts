import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MeService } from './me.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { MyClockInDto, MyClockOutDto } from './dto/my-attendance.dto';
import { MyLeaveRequestDto } from './dto/my-leave-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateLicenceDto } from '../licences/dto/create-licence.dto';

@Controller('me')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  async getMe(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.meService.getOverview(companyId, user);
  }

  @Get('overview')
  async getOverview(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.meService.getOverview(companyId, user);
  }

  @Get('profile')
  async getProfile(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.meService.getProfile(companyId, user);
  }

  @Patch('profile')
  async updateProfile(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMyProfileDto
  ) {
    return this.meService.updateProfile(companyId, user, dto);
  }

  @Get('company')
  async getCompany(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.meService.getCompany(companyId, user);
  }

  @Get('assignment')
  async getAssignment(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.meService.getAssignment(companyId, user);
  }

  @Get('shifts')
  async getShifts(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.meService.getShifts(companyId, user, { status, from, to });
  }

  @Post('shifts/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledgeShift(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') shiftId: string
  ) {
    return this.meService.acknowledgeShift(companyId, user, shiftId);
  }

  @Get('attendance')
  async getAttendance(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.meService.getAttendance(companyId, user);
  }

  @Post('attendance/clock-in')
  @HttpCode(HttpStatus.OK)
  async clockIn(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MyClockInDto
  ) {
    return this.meService.clockIn(companyId, user, dto);
  }

  @Post('attendance/clock-out')
  @HttpCode(HttpStatus.OK)
  async clockOut(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MyClockOutDto
  ) {
    return this.meService.clockOut(companyId, user, dto);
  }

  @Get('licences')
  async getLicences(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.meService.getLicences(companyId, user);
  }

  @Post('licences')
  @HttpCode(HttpStatus.CREATED)
  async createLicence(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLicenceDto
  ) {
    return this.meService.createLicence(companyId, user, dto);
  }

  @Get('leave')
  async getLeave(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.meService.getLeave(companyId, user);
  }

  @Post('leave')
  @HttpCode(HttpStatus.CREATED)
  async createLeaveRequest(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MyLeaveRequestDto
  ) {
    return this.meService.createLeaveRequest(companyId, user, dto);
  }
}
