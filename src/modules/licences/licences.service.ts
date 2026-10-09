import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService, LicenceEntity, LicenceStatus } from '../../database/database.service';
import { CreateLicenceDto } from './dto/create-licence.dto';
import { UpdateLicenceDto } from './dto/update-licence.dto';
import { VerifyLicenceDto } from './dto/verify-licence.dto';
import { QueryLicencesDto } from './dto/query-licences.dto';

@Injectable()
export class LicencesService {
  private readonly logger = new Logger(LicencesService.name);

  constructor(private db: DatabaseService) {}

  private calculateExpiryStatus(expiryDateStr: string): LicenceStatus {
    const expiry = new Date(expiryDateStr);
    const now = new Date();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    if (expiry.getTime() < now.getTime()) {
      return 'expired';
    } else if (expiry.getTime() - now.getTime() <= thirtyDays) {
      return 'expiring_soon';
    }
    return 'valid';
  }

  async createEmployeeLicence(
    companyId: string,
    actorId: string,
    employeeId: string,
    dto: CreateLicenceDto
  ): Promise<LicenceEntity> {
    const employee = await this.db.findEmployeeById(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee '${employeeId}' not found.`);
    }

    const calculatedStatus = this.calculateExpiryStatus(dto.expiryDate);

    const licence = await this.db.createLicence({
      companyId,
      employeeId,
      licenceType: dto.licenceType.trim(),
      licenceNumber: dto.licenceNumber.trim(),
      expiryDate: dto.expiryDate,
      documentUrl: dto.documentUrl,
      status: calculatedStatus,
      verifiedAt: new Date(),
      verifiedBy: actorId,
    });

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'LICENCE_CREATED',
      entity: 'employee_licences',
      entityId: licence.id,
      newValue: {
        employeeId,
        licenceType: licence.licenceType,
        licenceNumber: licence.licenceNumber,
        expiryDate: licence.expiryDate,
        status: licence.status,
      },
    });

    return licence;
  }

  async createEmployeeSubmissionLicence(
    companyId: string,
    employeeId: string,
    dto: CreateLicenceDto
  ): Promise<LicenceEntity> {
    const employee = await this.db.findEmployeeById(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee '${employeeId}' not found.`);
    }

    const licence = await this.db.createLicence({
      companyId,
      employeeId,
      licenceType: dto.licenceType.trim(),
      licenceNumber: dto.licenceNumber.trim(),
      expiryDate: dto.expiryDate,
      documentUrl: dto.documentUrl,
      status: 'pending_verification',
    });

    await this.db.recordAudit({
      companyId,
      userId: employee.userId || employeeId,
      action: 'EMPLOYEE_LICENCE_SUBMITTED',
      entity: 'employee_licences',
      entityId: licence.id,
      newValue: {
        employeeId,
        licenceType: licence.licenceType,
        licenceNumber: licence.licenceNumber,
        expiryDate: licence.expiryDate,
        documentUrl: licence.documentUrl,
        status: licence.status,
      },
    });

    return licence;
  }

  async findLicences(companyId: string, query: QueryLicencesDto) {
    return this.db.findLicences(companyId, {
      status: query.status,
      employeeId: query.employeeId,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
  }

  async findEmployeeLicences(companyId: string, employeeId: string): Promise<LicenceEntity[]> {
    const employee = await this.db.findEmployeeById(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee '${employeeId}' not found.`);
    }
    return this.db.findLicencesByEmployeeId(companyId, employeeId);
  }

  async getLicenceById(companyId: string, id: string): Promise<LicenceEntity> {
    const licence = await this.db.findLicenceById(companyId, id);
    if (!licence) {
      throw new NotFoundException(`Licence '${id}' not found.`);
    }
    return licence;
  }

  async updateLicence(
    companyId: string,
    actorId: string,
    id: string,
    dto: UpdateLicenceDto
  ): Promise<LicenceEntity> {
    const existing = await this.getLicenceById(companyId, id);

    let status = dto.status;
    if (!status && dto.expiryDate) {
      status = this.calculateExpiryStatus(dto.expiryDate);
    }

    const updated = await this.db.updateLicence(companyId, id, {
      ...(dto.licenceType && { licenceType: dto.licenceType.trim() }),
      ...(dto.licenceNumber && { licenceNumber: dto.licenceNumber.trim() }),
      ...(dto.expiryDate && { expiryDate: dto.expiryDate }),
      ...(status && { status }),
    });

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'LICENCE_UPDATED',
      entity: 'employee_licences',
      entityId: id,
      oldValue: {
        status: existing.status,
        expiryDate: existing.expiryDate,
      },
      newValue: {
        status: updated.status,
        expiryDate: updated.expiryDate,
      },
    });

    return updated;
  }

  async verifyLicence(
    companyId: string,
    actorId: string,
    id: string,
    dto: VerifyLicenceDto
  ): Promise<LicenceEntity> {
    const existing = await this.getLicenceById(companyId, id);
    const updated = await this.db.verifyLicence(companyId, id, actorId, dto.status);

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'LICENCE_VERIFIED',
      entity: 'employee_licences',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: dto.status, verifiedBy: actorId },
    });

    return updated;
  }

  async deleteLicence(companyId: string, actorId: string, id: string): Promise<boolean> {
    const existing = await this.getLicenceById(companyId, id);
    const deleted = await this.db.deleteLicence(companyId, id);

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'LICENCE_DELETED',
      entity: 'employee_licences',
      entityId: id,
      oldValue: {
        employeeId: existing.employeeId,
        licenceType: existing.licenceType,
        licenceNumber: existing.licenceNumber,
      },
    });

    return deleted;
  }

  async getComplianceSummary(companyId: string) {
    return this.db.getLicenceComplianceSummary(companyId);
  }
}
