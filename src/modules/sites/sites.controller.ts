import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { CreateJobTypeDto } from './dto/create-job-type.dto';
import { UpdateJobTypeDto } from './dto/update-job-type.dto';
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

  // --- BULK RATES MATRIX (Must be declared before sites/:id) ---
  @Get('sites/jobs/matrix')
  @Roles(Role.Owner, Role.Admin, Role.Manager, Role.Supervisor)
  async getSiteJobsMatrix(@TenantId() companyId: string) {
    return this.sitesService.getSiteJobsMatrix(companyId);
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

  @Get('job-types/:id')
  @Roles(Role.Owner, Role.Admin, Role.Manager, Role.Supervisor)
  async getJobTypeById(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.sitesService.getJobTypeById(companyId, id);
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

  @Patch('job-types/:id')
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  async updateJobType(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateJobTypeDto
  ) {
    return this.sitesService.updateJobType(companyId, actor.id, id, dto);
  }

  @Delete('job-types/:id')
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  async deleteJobType(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string
  ) {
    return this.sitesService.deleteJobType(companyId, actor.id, id);
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

  @Delete('sites/:siteId/jobs/:jobId')
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  async deleteSiteJob(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('jobId') jobId: string
  ) {
    return this.sitesService.deleteSiteJob(companyId, actor.id, siteId, jobId);
  }
}

