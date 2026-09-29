import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { CreateJobTypeDto } from './dto/create-job-type.dto';
import { AddSiteJobDto, UpdateSiteJobDto } from './dto/add-site-job.dto';

@Injectable()
export class SitesService {
  private readonly logger = new Logger(SitesService.name);

  constructor(private db: DatabaseService) {}

  // --- SITES ---
  async getSites(companyId: string) {
    const sites = await this.db.findSites(companyId);
    // Attach site jobs count to each site for operational overview
    return Promise.all(
      sites.map(async (s) => {
        const jobs = await this.db.findSiteJobs(companyId, s.id);
        return {
          ...s,
          configuredJobsCount: jobs.length,
        };
      })
    );
  }

  async getSiteById(companyId: string, id: string) {
    const site = await this.db.findSiteById(companyId, id);
    if (!site) {
      throw new NotFoundException(`Site '${id}' not found.`);
    }
    const jobs = await this.db.findSiteJobs(companyId, id);
    return {
      ...site,
      jobs,
    };
  }

  async createSite(companyId: string, actorId: string, dto: CreateSiteDto) {
    const existing = await this.db.findSiteByCode(companyId, dto.code);
    if (existing) {
      throw new ConflictException(
        `Site code '${dto.code}' is already assigned to site '${existing.name}'.`
      );
    }

    const site = await this.db.createSite({
      companyId,
      name: dto.name.trim(),
      code: dto.code.toUpperCase().trim(),
      address: dto.address,
      contactName: dto.contactName?.trim(),
      contactPhone: dto.contactPhone?.trim(),
      contactEmail: dto.contactEmail?.toLowerCase().trim(),
      status: 'active',
    });

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'SITE_CREATED',
      entity: 'sites',
      entityId: site.id,
      newValue: { name: site.name, code: site.code },
    });

    return site;
  }

  async updateSite(
    companyId: string,
    actorId: string,
    id: string,
    dto: Partial<CreateSiteDto> & { status?: 'active' | 'inactive' | 'archived' }
  ) {
    const existing = await this.db.findSiteById(companyId, id);
    if (!existing) {
      throw new NotFoundException(`Site '${id}' not found.`);
    }

    const updated = await this.db.updateSite(companyId, id, {
      ...(dto.name && { name: dto.name.trim() }),
      ...(dto.address && { address: dto.address }),
      ...(dto.contactName && { contactName: dto.contactName.trim() }),
      ...(dto.contactPhone && { contactPhone: dto.contactPhone.trim() }),
      ...(dto.contactEmail && { contactEmail: dto.contactEmail.toLowerCase().trim() }),
      ...(dto.status && { status: dto.status }),
    });

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'SITE_UPDATED',
      entity: 'sites',
      entityId: id,
      oldValue: { name: existing.name, status: existing.status },
      newValue: dto,
    });

    return updated;
  }

  // --- JOB TYPES ---
  async getJobTypes(companyId: string) {
    return this.db.findJobTypes(companyId);
  }

  async createJobType(companyId: string, actorId: string, dto: CreateJobTypeDto) {
    const existing = await this.db.findJobTypeByName(companyId, dto.name);
    if (existing) {
      throw new ConflictException(`Job type '${dto.name}' already exists in your company.`);
    }

    const jobType = await this.db.createJobType({
      companyId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      isActive: true,
    });

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'JOB_TYPE_CREATED',
      entity: 'job_types',
      entityId: jobType.id,
      newValue: { name: jobType.name },
    });

    return jobType;
  }

  // --- SITE JOBS & RATES (SECTION 21) ---
  async getSiteJobs(companyId: string, siteId: string) {
    const site = await this.db.findSiteById(companyId, siteId);
    if (!site) {
      throw new NotFoundException(`Site '${siteId}' not found.`);
    }
    return this.db.findSiteJobs(companyId, siteId);
  }

  async addSiteJob(companyId: string, actorId: string, siteId: string, dto: AddSiteJobDto) {
    const site = await this.db.findSiteById(companyId, siteId);
    if (!site) {
      throw new NotFoundException(`Site '${siteId}' not found.`);
    }

    const jobType = await this.db.findJobTypeById(companyId, dto.jobTypeId);
    if (!jobType) {
      throw new NotFoundException(`Job Type '${dto.jobTypeId}' not found.`);
    }

    // Strictly prevent duplicate job attachment on the same site
    const existingPair = await this.db.findSiteJobByPair(companyId, siteId, dto.jobTypeId);
    if (existingPair) {
      throw new ConflictException(
        `Job role '${jobType.name}' is already attached to this site. Update the rate instead.`
      );
    }

    const siteJob = await this.db.createSiteJob({
      companyId,
      siteId,
      jobTypeId: dto.jobTypeId,
      defaultPayRate: dto.defaultPayRate,
      billingRate: dto.billingRate,
      currency: dto.currency || 'GBP',
      status: 'active',
    });

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'SITE_JOB_ADDED',
      entity: 'site_jobs',
      entityId: siteJob.id,
      newValue: {
        site: site.name,
        jobRole: jobType.name,
        payRate: siteJob.defaultPayRate,
        billingRate: siteJob.billingRate,
      },
    });

    return {
      ...siteJob,
      jobType,
    };
  }

  async updateSiteJob(
    companyId: string,
    actorId: string,
    siteId: string,
    siteJobId: string,
    dto: UpdateSiteJobDto
  ) {
    const sj = await this.db.findSiteJobById(companyId, siteJobId);
    if (!sj || sj.siteId !== siteId) {
      throw new NotFoundException(`Site Job rate configuration '${siteJobId}' not found.`);
    }

    const updated = await this.db.updateSiteJob(companyId, siteJobId, {
      ...(dto.defaultPayRate !== undefined && { defaultPayRate: dto.defaultPayRate }),
      ...(dto.billingRate !== undefined && { billingRate: dto.billingRate }),
      ...(dto.status && { status: dto.status }),
    });

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'SITE_JOB_RATE_UPDATED',
      entity: 'site_jobs',
      entityId: siteJobId,
      oldValue: { payRate: sj.defaultPayRate, billingRate: sj.billingRate },
      newValue: dto,
    });

    return updated;
  }
}
