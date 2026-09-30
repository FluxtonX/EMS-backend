import { Test, TestingModule } from '@nestjs/testing';
import { LicencesService } from './licences.service';
import { DatabaseModule } from '../../database/database.module';
import { DatabaseService } from '../../database/database.service';
import { NotFoundException } from '@nestjs/common';

describe('Phase 7: Licences & Compliance Module Tests', () => {
  let service: LicencesService;
  let db: DatabaseService;

  const companyA = 'comp_alpha_111';
  const companyB = 'comp_beta_222';
  const actorId = 'actor_admin_999';
  let employeeId: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [LicencesService],
    }).compile();

    service = module.get<LicencesService>(LicencesService);
    db = module.get<DatabaseService>(DatabaseService);

    // Create an employee in company A
    const emp = await db.createEmployee({
      companyId: companyA,
      employeeNumber: `EMP-${Date.now().toString().slice(-4)}`,
      firstName: 'Tariq',
      lastName: 'Hassan',
      email: `tariq.${Date.now()}@example.co.uk`,
      phone: '+44 7700 900555',
      dateOfBirth: '1988-11-20',
      address: { line1: '12 Piccadilly', city: 'Manchester', postalCode: 'M1 1AE', country: 'UK' },
      emergencyContact: { name: 'Amina', relationship: 'Wife', phone: '+44 7700 900666' },
      employmentStatus: 'active',
      employmentStartDate: '2025-06-01',
    });
    employeeId = emp.id;
  });

  it('should automatically set status to "valid" for future expiry > 30 days', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);
    const expiryDate = futureDate.toISOString().split('T')[0];

    const lic = await service.createEmployeeLicence(companyA, actorId, employeeId, {
      licenceType: 'SIA Door Supervisor',
      licenceNumber: '1000200030004000',
      expiryDate,
    });

    expect(lic).toBeDefined();
    expect(lic.id).toBeDefined();
    expect(lic.status).toBe('valid');
  });

  it('should automatically set status to "expiring_soon" for expiry within 30 days', async () => {
    const nearDate = new Date();
    nearDate.setDate(nearDate.getDate() + 15);
    const expiryDate = nearDate.toISOString().split('T')[0];

    const lic = await service.createEmployeeLicence(companyA, actorId, employeeId, {
      licenceType: 'SIA Security Guard',
      licenceNumber: '5555666677778888',
      expiryDate,
    });

    expect(lic.status).toBe('expiring_soon');
  });

  it('should automatically set status to "expired" for past expiry', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const expiryDate = pastDate.toISOString().split('T')[0];

    const lic = await service.createEmployeeLicence(companyA, actorId, employeeId, {
      licenceType: 'SIA CCTV',
      licenceNumber: '9999888877776666',
      expiryDate,
    });

    expect(lic.status).toBe('expired');
  });

  it('should verify or reject a licence by an authorized supervisor/manager', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const expiryDate = futureDate.toISOString().split('T')[0];

    const lic = await service.createEmployeeLicence(companyA, actorId, employeeId, {
      licenceType: 'SIA Close Protection',
      licenceNumber: '1122334455667788',
      expiryDate,
    });

    const verified = await service.verifyLicence(companyA, actorId, lic.id, {
      status: 'rejected',
    });

    expect(verified.status).toBe('rejected');
    expect(verified.verifiedBy).toBe(actorId);
  });

  it('should compute operational compliance summary correctly', async () => {
    const summary = await service.getComplianceSummary(companyA);
    expect(summary).toBeDefined();
    expect(summary.total).toBeGreaterThanOrEqual(0);
    expect(summary.valid).toBeGreaterThanOrEqual(0);
    expect(summary.expiringSoon).toBeGreaterThanOrEqual(0);
    expect(summary.expired).toBeGreaterThanOrEqual(0);
  });

  it('should reject access to licence belonging to another company (tenant isolation)', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const expiryDate = futureDate.toISOString().split('T')[0];

    const lic = await service.createEmployeeLicence(companyA, actorId, employeeId, {
      licenceType: 'SIA Door Supervisor',
      licenceNumber: '4433221100998877',
      expiryDate,
    });

    await expect(service.getLicenceById(companyB, lic.id)).rejects.toThrow(NotFoundException);
  });
});
