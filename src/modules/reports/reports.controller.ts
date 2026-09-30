import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * POST /api/v1/reports/generate
   * Generate a report and return as JSON or CSV stream.
   * Requires REPORTS_VIEW permission.
   */
  @Post('generate')
  @RequirePermissions(Permission.REPORT_VIEW)
  @HttpCode(HttpStatus.OK)
  async generate(
    @TenantId() companyId: string,
    @Body() dto: GenerateReportDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const report = await this.reportsService.generate(companyId, dto);

    if (dto.format === 'csv') {
      const csv = this.reportsService.toCSV(report);
      const filename = `${report.type}-report-${new Date().toISOString().split('T')[0]}.csv`;
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      const buffer = Buffer.from(csv, 'utf-8');
      return new StreamableFile(buffer);
    }

    return { data: report };
  }
}
