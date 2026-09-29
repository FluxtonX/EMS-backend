import { Test, TestingModule } from '@nestjs/testing';
import { SitesService } from './sites.service';
import { DatabaseModule } from '../../database/database.module';
import { DatabaseService } from '../../database/database.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('Phase 3: Sites + Jobs + Rates Matrix Tests', () => {
  let service: SitesService;
  let db: DatabaseService;

  const companyA = 'comp_alpha_111';
  const companyB = 'comp_beta_222';
  const actorId = 'actor_admin_999';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [SitesService],
    }).compile();

    service = module.get<SitesService>(SitesService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  it('should successfully create a site with unique code', async () => {
    const site = await service.createSite(companyA, actorId, {
      name: 'Canary Wharf Mall',
      code: 'CW-01',
      address: {
        line1: '1 Canada Square',
        city: 'London',
        postalCode: 'E14 5AA',
        country: 'United Kingdom',
      },
      contactName: 'James Wilson',
      contactPhone: '+44 7700 900555',
      contactEmail: 'security@canarywharf.com',
    });

    expect(site).toBeDefined();
    expect(site.id).toBeDefined();
    expect(site.code).toBe('CW-01');
    expect(site.name).toBe('Canary Wharf Mall');

    // Audit log verification
    const logs = await db.getAuditLogs(companyA);
    expect(logs.some((l) => l.action === 'SITE_CREATED' && l.entityId === site.id)).toBe(true);
  });

  it('should reject duplicate site code within same company', async () => {
    await service.createSite(companyA, actorId, {
      name: 'Canary Wharf Mall',
      code: 'CW-01',
      address: { line1: '1 Canada Square', city: 'London', postalCode: 'E14 5AA', country: 'UK' },
    });

    await expect(
      service.createSite(companyA, actorId, {
        name: 'Another Site',
        code: 'CW-01',
        address: { line1: '2 High St', city: 'London', postalCode: 'E1 1AA', country: 'UK' },
      })
    ).rejects.toThrow(ConflictException);
  });

  it('should allow same site code in a different company (multi-tenant boundary)', async () => {
    await service.createSite(companyA, actorId, {
      name: 'Site A in Comp A',
      code: 'CW-01',
      address: { line1: '1 Canada Square', city: 'London', postalCode: 'E14 5AA', country: 'UK' },
    });

    const siteB = await service.createSite(companyB, actorId, {
      name: 'Site B in Comp B',
      code: 'CW-01',
      address: { line1: '10 Oxford St', city: 'London', postalCode: 'W1D 1BS', country: 'UK' },
    });

    expect(siteB).toBeDefined();
    expect(siteB.companyId).toBe(companyB);
  });

  it('should create global job type and reject duplicate within company', async () => {
    const job = await service.createJobType(companyA, actorId, {
      name: 'Security Guard',
      description: 'Static guarding & access control',
    });

    expect(job).toBeDefined();
    expect(job.name).toBe('Security Guard');

    await expect(
      service.createJobType(companyA, actorId, {
        name: 'Security Guard',
      })
    ).rejects.toThrow(ConflictException);
  });

  it('should attach job type to site with custom pay rate and billing rate (Section 21)', async () => {
    const site = await service.createSite(companyA, actorId, {
      name: 'Heathrow Cargo Hub',
      code: 'HTR-02',
      address: { line1: 'Cargo Terminal', city: 'Hounslow', postalCode: 'TW6 1AA', country: 'UK' },
    });

    const job = await service.createJobType(companyA, actorId, {
      name: 'CCTV Operator',
    });

    const siteJob = await service.addSiteJob(companyA, actorId, site.id, {
      jobTypeId: job.id,
      defaultPayRate: 16.5,
      billingRate: 24.0,
      currency: 'GBP',
    });

    expect(siteJob).toBeDefined();
    expect(siteJob.defaultPayRate).toBe(16.5);
    expect(siteJob.billingRate).toBe(24.0);
    expect(siteJob.jobType.name).toBe('CCTV Operator');

    // Retrieve site jobs
    const jobs = await service.getSiteJobs(companyA, site.id);
    expect(jobs.length).toBe(1);
    expect(jobs[0].defaultPayRate).toBe(16.5);
  });

  it('should reject attaching the same job role twice to the same site (no duplicate data)', async () => {
    const site = await service.createSite(companyA, actorId, {
      name: 'Mayfair Commercial Plaza',
      code: 'MAY-03',
      address: { line1: 'Park Lane', city: 'London', postalCode: 'W1K 1AA', country: 'UK' },
    });

    const job = await service.createJobType(companyA, actorId, {
      name: 'Door Supervisor',
    });

    await service.addSiteJob(companyA, actorId, site.id, {
      jobTypeId: job.id,
      defaultPayRate: 15.0,
      billingRate: 21.0,
    });

    // Attempt duplicate attach
    await expect(
      service.addSiteJob(companyA, actorId, site.id, {
        jobTypeId: job.id,
        defaultPayRate: 18.0,
        billingRate: 25.0,
      })
    ).rejects.toThrow(ConflictException);
  });

  it('should update rates for site job and record audit trail', async () => {
    const site = await service.createSite(companyA, actorId, {
      name: 'Greenwich Distribution Ctr',
      code: 'GRN-04',
      address: { line1: 'Tunnel Ave', city: 'London', postalCode: 'SE10 0AA', country: 'UK' },
    });

    const job = await service.createJobType(companyA, actorId, {
      name: 'Mobile Patrol',
    });

    const siteJob = await service.addSiteJob(companyA, actorId, site.id, {
      jobTypeId: job.id,
      defaultPayRate: 14.0,
      billingRate: 20.0,
    });

    const updated = await service.updateSiteJob(companyA, actorId, site.id, siteJob.id, {
      defaultPayRate: 15.5,
      billingRate: 22.5,
    });

    expect(updated).toBeDefined();
    expect(updated?.defaultPayRate).toBe(15.5);
    expect(updated?.billingRate).toBe(22.5);

    const logs = await db.getAuditLogs(companyA);
    expect(logs.some((l) => l.action === 'SITE_JOB_RATE_UPDATED' && l.entityId === siteJob.id)).toBe(
      true
    );
  });

  it('should block cross-company access to site jobs', async () => {
    const siteA = await service.createSite(companyA, actorId, {
      name: 'Secure Site A',
      code: 'SEC-01',
      address: { line1: 'Tower Hill', city: 'London', postalCode: 'EC3N 4AB', country: 'UK' },
    });

    // Attempt to access from Company B
    await expect(service.getSiteJobs(companyB, siteA.id)).rejects.toThrow(NotFoundException);
  });
});
