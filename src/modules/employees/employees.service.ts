import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DatabaseService, EmploymentStatus, LicenceStatus, LicenceEntity } from '../../database/database.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { QueryEmployeesDto } from './dto/query-employees.dto';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(private db: DatabaseService) {}

  async findAll(companyId: string, query: QueryEmployeesDto) {
    const result = await this.db.findEmployees(companyId, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status as EmploymentStatus | 'all',
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    // Attach licence status summary for operational overview (Section 34)
    const itemsWithLicences = await Promise.all(
      result.items.map(async (emp) => {
        const licences = await this.db.findLicencesByEmployeeId(companyId, emp.id);
        const primaryLicence = licences[0] || null;
        return {
          ...emp,
          licence: primaryLicence
            ? {
                type: primaryLicence.licenceType,
                number: primaryLicence.licenceNumber,
                expiryDate: primaryLicence.expiryDate,
                status: primaryLicence.status,
              }
            : null,
        };
      })
    );

    return {
      items: itemsWithLicences,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    };
  }

  async findById(companyId: string, id: string) {
    const employee = await this.db.findEmployeeById(companyId, id);
    if (!employee) {
      throw new NotFoundException(`Employee record '${id}' not found.`);
    }

    const licences = await this.db.findLicencesByEmployeeId(companyId, id);

    return {
      ...employee,
      licences,
      // Current assignment will be derived from assignments in Phase 4 (Section 18, 20)
      currentAssignment: null,
    };
  }

  async create(companyId: string, actorId: string, dto: CreateEmployeeDto) {
    // 1. Enforce unique employee number within company
    const existing = await this.db.findEmployeeByNumber(companyId, dto.employeeNumber);
    if (existing) {
      throw new ConflictException(
        `Employee ID '${dto.employeeNumber}' is already assigned to another workforce record in this company.`
      );
    }

    // 2. Create permanent employee entity
    const employee = await this.db.createEmployee({
      companyId,
      employeeNumber: dto.employeeNumber,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone.trim(),
      dateOfBirth: dto.dateOfBirth,
      address: dto.address,
      emergencyContact: dto.emergencyContact,
      employmentStatus: (dto.employmentStatus as EmploymentStatus) || 'active',
      employmentStartDate: dto.employmentStartDate,
    });

    // 3. Optional initial licence creation
    let createdLicence: LicenceEntity | null = null;
    if (dto.initialLicence) {
      // Determine licence status based on expiry
      const expiry = new Date(dto.initialLicence.expiryDate);
      const now = new Date();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      let status: LicenceStatus = 'valid';
      if (expiry.getTime() < now.getTime()) {
        status = 'expired';
      } else if (expiry.getTime() - now.getTime() < thirtyDays) {
        status = 'expiring_soon';
      }

      createdLicence = await this.db.createLicence({
        companyId,
        employeeId: employee.id,
        licenceType: dto.initialLicence.licenceType,
        licenceNumber: dto.initialLicence.licenceNumber,
        expiryDate: dto.initialLicence.expiryDate,
        status,
        verifiedAt: new Date(),
        verifiedBy: actorId,
      });
    }

    // 4. Record audit log
    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'EMPLOYEE_CREATED',
      entity: 'employees',
      entityId: employee.id,
      newValue: {
        employeeNumber: employee.employeeNumber,
        name: `${employee.firstName} ${employee.lastName}`,
        status: employee.employmentStatus,
      },
    });

    return {
      ...employee,
      licence: createdLicence,
    };
  }

  async update(companyId: string, actorId: string, id: string, dto: UpdateEmployeeDto) {
    const existing = await this.db.findEmployeeById(companyId, id);
    if (!existing) {
      throw new NotFoundException(`Employee record '${id}' not found.`);
    }

    const updated = await this.db.updateEmployee(companyId, id, {
      ...(dto.firstName && { firstName: dto.firstName.trim() }),
      ...(dto.lastName && { lastName: dto.lastName.trim() }),
      ...(dto.email && { email: dto.email.toLowerCase().trim() }),
      ...(dto.phone && { phone: dto.phone.trim() }),
      ...(dto.address && { address: dto.address }),
      ...(dto.emergencyContact && { emergencyContact: dto.emergencyContact }),
      ...(dto.employmentStatus && { employmentStatus: dto.employmentStatus as EmploymentStatus }),
      ...(dto.employmentEndDate && { employmentEndDate: dto.employmentEndDate }),
    });

    // Record audit log
    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'EMPLOYEE_UPDATED',
      entity: 'employees',
      entityId: id,
      oldValue: {
        status: existing.employmentStatus,
        phone: existing.phone,
        email: existing.email,
      },
      newValue: dto,
    });

    return updated;
  }
}
