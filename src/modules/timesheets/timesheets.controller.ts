import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { GenerateTimesheetsDto } from './dto/generate-timesheets.dto';
import { QueryTimesheetsDto } from './dto/query-timesheets.dto';
import { AdjustTimesheetEntryDto } from './dto/adjust-timesheet-entry.dto';
import { ReviewTimesheetDto } from './dto/review-timesheet.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@Controller('timesheets')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  /**
   * POST /api/v1/timesheets/generate
   * Generates or calculates timesheets for a given date range.
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.TIMESHEET_MANAGE)
  async generate(
    @TenantId() companyId: string,
    @Body() dto: GenerateTimesheetsDto
  ) {
    return this.timesheetsService.generateTimesheets(companyId, dto);
  }

  /**
   * GET /api/v1/timesheets
   * Query all timesheets for company with status and date filters.
   */
  @Get()
  @RequirePermissions(Permission.TIMESHEET_VIEW)
  async findAll(
    @TenantId() companyId: string,
    @Query() query: QueryTimesheetsDto
  ) {
    return this.timesheetsService.findAll(companyId, query);
  }

  /**
   * GET /api/v1/timesheets/:id
   * Get single timesheet with full line entries and breakdown.
   */
  @Get(':id')
  @RequirePermissions(Permission.TIMESHEET_VIEW)
  async findOne(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.timesheetsService.findOne(companyId, id);
  }

  /**
   * PATCH /api/v1/timesheets/:id/entries/:entryId/adjust
   * Supervisor adjustment with mandatory reason and immutable audit log.
   */
  @Patch(':id/entries/:entryId/adjust')
  @RequirePermissions(Permission.TIMESHEET_MANAGE)
  async adjustEntry(
    @TenantId() companyId: string,
    @Param('id') timesheetId: string,
    @Param('entryId') entryId: string,
    @Body() dto: AdjustTimesheetEntryDto,
    @CurrentUser('id') supervisorUserId: string
  ) {
    return this.timesheetsService.adjustEntry(
      companyId,
      timesheetId,
      entryId,
      dto,
      supervisorUserId
    );
  }

  /**
   * PATCH /api/v1/timesheets/:id/review
   * Approve, reject, or lock a timesheet.
   */
  @Patch(':id/review')
  @RequirePermissions(Permission.TIMESHEET_APPROVE)
  async review(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Body() dto: ReviewTimesheetDto,
    @CurrentUser('id') supervisorUserId: string
  ) {
    return this.timesheetsService.review(companyId, id, dto, supervisorUserId);
  }
}
