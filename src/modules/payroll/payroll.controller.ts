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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PayrollService } from './payroll.service';
import { CreatePayRunDto } from './dto/create-pay-run.dto';
import { QueryPayRunsDto } from './dto/query-pay-runs.dto';
import { ReviewPayRunDto } from './dto/review-pay-run.dto';
import { QueryPayslipsDto } from './dto/query-payslips.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  /**
   * POST /api/v1/payroll/runs
   * Initiate and calculate a new payroll run.
   */
  @Post('runs')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.PAYROLL_MANAGE)
  async createPayRun(
    @TenantId() companyId: string,
    @Body() dto: CreatePayRunDto,
    @CurrentUser('id') userId: string
  ) {
    return this.payrollService.createPayRun(companyId, dto, userId);
  }

  /**
   * GET /api/v1/payroll/runs
   * List all pay runs with period and status filtering.
   */
  @Get('runs')
  @RequirePermissions(Permission.PAYROLL_VIEW)
  async findAllPayRuns(
    @TenantId() companyId: string,
    @Query() query: QueryPayRunsDto
  ) {
    return this.payrollService.findAllPayRuns(companyId, query);
  }

  /**
   * GET /api/v1/payroll/runs/:id
   * Get single pay run with full itemized payslips breakdown.
   */
  @Get('runs/:id')
  @RequirePermissions(Permission.PAYROLL_VIEW)
  async findOnePayRun(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.payrollService.findOnePayRun(companyId, id);
  }

  /**
   * PATCH /api/v1/payroll/runs/:id/review
   * Transition pay run status (approve, pay/finalize, cancel).
   */
  @Patch('runs/:id/review')
  @RequirePermissions(Permission.PAYROLL_APPROVE)
  async reviewPayRun(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Body() dto: ReviewPayRunDto,
    @CurrentUser('id') userId: string
  ) {
    return this.payrollService.reviewPayRun(companyId, id, dto, userId);
  }

  /**
   * GET /api/v1/payroll/runs/:id/export
   * Export payroll run as CSV for accountant and BACS upload.
   */
  @Get('runs/:id/export')
  @RequirePermissions(Permission.PAYROLL_VIEW)
  async exportPayRunCsv(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Res() res: Response
  ) {
    const csvData = await this.payrollService.exportPayRunCsv(companyId, id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="pay-run-${id.slice(0, 8)}.csv"`
    );
    return res.send(csvData);
  }

  /**
   * GET /api/v1/payroll/payslips
   * Query payslips for employees or specific pay runs.
   */
  @Get('payslips')
  @RequirePermissions(Permission.PAYSLIP_VIEW)
  async findPayslips(
    @TenantId() companyId: string,
    @Query() query: QueryPayslipsDto
  ) {
    return this.payrollService.findPayslips(companyId, query);
  }

  /**
   * GET /api/v1/payroll/payslips/:id
   * Get single payslip for viewing / printing.
   */
  @Get('payslips/:id')
  @RequirePermissions(Permission.PAYSLIP_VIEW)
  async findPayslipById(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.payrollService.findPayslipById(companyId, id);
  }
}
