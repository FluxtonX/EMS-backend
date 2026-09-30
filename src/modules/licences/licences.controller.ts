import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { LicencesService } from './licences.service';
import { CreateLicenceDto } from './dto/create-licence.dto';
import { UpdateLicenceDto } from './dto/update-licence.dto';
import { VerifyLicenceDto } from './dto/verify-licence.dto';
import { QueryLicencesDto } from './dto/query-licences.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class LicencesController {
  constructor(private readonly licencesService: LicencesService) {}

  @Get('licences/compliance-summary')
  @RequirePermissions(Permission.LICENCE_VIEW)
  async getComplianceSummary(@TenantId() companyId: string) {
    return this.licencesService.getComplianceSummary(companyId);
  }

  @Get('licences')
  @RequirePermissions(Permission.LICENCE_VIEW)
  async getLicences(
    @TenantId() companyId: string,
    @Query() query: QueryLicencesDto
  ) {
    return this.licencesService.findLicences(companyId, query);
  }

  @Get('licences/:id')
  @RequirePermissions(Permission.LICENCE_VIEW)
  async getLicence(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.licencesService.getLicenceById(companyId, id);
  }

  @Post('employees/:employeeId/licences')
  @RequirePermissions(Permission.LICENCE_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  async createLicence(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateLicenceDto
  ) {
    return this.licencesService.createEmployeeLicence(companyId, user?.id, employeeId, dto);
  }

  @Get('employees/:employeeId/licences')
  @RequirePermissions(Permission.LICENCE_VIEW)
  async getEmployeeLicences(
    @TenantId() companyId: string,
    @Param('employeeId') employeeId: string
  ) {
    return this.licencesService.findEmployeeLicences(companyId, employeeId);
  }

  @Patch('licences/:id')
  @RequirePermissions(Permission.LICENCE_MANAGE)
  async updateLicence(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLicenceDto
  ) {
    return this.licencesService.updateLicence(companyId, user?.id, id, dto);
  }

  @Patch('licences/:id/verify')
  @RequirePermissions(Permission.DOCUMENT_VERIFY)
  async verifyLicence(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VerifyLicenceDto
  ) {
    return this.licencesService.verifyLicence(companyId, user?.id, id, dto);
  }

  @Delete('licences/:id')
  @RequirePermissions(Permission.LICENCE_MANAGE)
  async deleteLicence(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string
  ) {
    return this.licencesService.deleteLicence(companyId, user?.id, id);
  }
}
