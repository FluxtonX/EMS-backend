import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { CreateJobTypeDto } from './dto/create-job-type.dto';
import { AddSiteJobDto, UpdateSiteJobDto } from './dto/add-site-job.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class SitesController {
  constructor(private sitesService: SitesService) {}

  // --- SITES ---
  @Get('sites')
  @Roles(Role.Owner, Role.Admin, Role.Manager, Role.Supervisor)
  async getSites(@TenantId() companyId: string) {
    return this.sitesService.getSites(companyId);
  }

  @Get('sites/:id')
  @Roles(Role.Owner, Role.Admin, Role.Manager, Role.Supervisor)
  async getSiteById(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.sitesService.getSiteById(companyId, id);
  }

  @Post('sites')
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  @HttpCode(HttpStatus.CREATED)
  async createSite(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateSiteDto
  ) {
    return this.sitesService.createSite(companyId, actor.id, dto);
  }

  @Patch('sites/:id')
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  async updateSite(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateSiteDto>
  ) {
    return this.sitesService.updateSite(companyId, actor.id, id, dto);
  }

  // --- JOB TYPES (GLOBAL/COMPANY-WIDE) ---
  @Get('job-types')
  @Roles(Role.Owner, Role.Admin, Role.Manager, Role.Supervisor)
  async getJobTypes(@TenantId() companyId: string) {
    return this.sitesService.getJobTypes(companyId);
  }

  @Post('job-types')
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  @HttpCode(HttpStatus.CREATED)
  async createJobType(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateJobTypeDto
  ) {
    return this.sitesService.createJobType(companyId, actor.id, dto);
  }

  // --- SITE JOBS & RATES MATRIX ---
  @Get('sites/:id/jobs')
  @Roles(Role.Owner, Role.Admin, Role.Manager, Role.Supervisor)
  async getSiteJobs(
    @TenantId() companyId: string,
    @Param('id') siteId: string
  ) {
    return this.sitesService.getSiteJobs(companyId, siteId);
  }

  @Post('sites/:id/jobs')
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  @HttpCode(HttpStatus.CREATED)
  async addSiteJob(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') siteId: string,
    @Body() dto: AddSiteJobDto
  ) {
    return this.sitesService.addSiteJob(companyId, actor.id, siteId, dto);
  }

  @Patch('sites/:siteId/jobs/:jobId')
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  async updateSiteJob(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateSiteJobDto
  ) {
    return this.sitesService.updateSiteJob(companyId, actor.id, siteId, jobId, dto);
  }
}
