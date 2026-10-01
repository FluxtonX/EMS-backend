import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService, EmploymentStatus, LicenceStatus, LicenceEntity } from '../../database/database.service';
import { BrevoService } from '../notifications/brevo.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { QueryEmployeesDto } from './dto/query-employees.dto';
import { OnboardEmployeeDto } from './dto/onboard-employee.dto';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private db: DatabaseService,
    private brevoService: BrevoService,
    private assignmentsService: AssignmentsService,
  ) {}

  async findAll(companyId: string, query: QueryEmployeesDto) {
    const result = await this.db.findEmployees(companyId, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status as EmploymentStatus | 'all',
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    if (result.items.length === 0) {
      return {
        items: [],
        total: 0,
        page: result.page,
        totalPages: 0,
      };
    }

    // Batch load active assignments across the company to eliminate N+1 queries (Phase 8 Optimization)
    const activeAssignments = await this.db.findCompanyAssignments(companyId, { status: 'active' });
    const assignmentMap = new Map<string, any>();
    for (const a of activeAssignments) {
      if (!assignmentMap.has(a.employeeId)) {
        assignmentMap.set(a.employeeId, a);
      }
    }

    // Batch load licences across the company to eliminate N+1 queries
    const licencesResult = await this.db.findLicences(companyId, { limit: 1000 });
    const licenceMap = new Map<string, any>();
    for (const lic of licencesResult.items) {
      if (!licenceMap.has(lic.employeeId)) {
        licenceMap.set(lic.employeeId, lic);
      }
    }

    // Map in-memory synchronously with O(1) lookups
    const itemsWithDetails = result.items.map((emp) => {
      const activeAssignment = assignmentMap.get(emp.id) || null;
      const primaryLicence = licenceMap.get(emp.id) || null;

      return {
        ...emp,
        currentAssignment: activeAssignment
          ? {
              id: activeAssignment.id,
              siteName: activeAssignment.siteJob?.site?.name || 'Assigned Site',
              siteCode: activeAssignment.siteJob?.site?.code || '',
              role: activeAssignment.siteJob?.jobType?.name || 'Security Officer',
              payRate: activeAssignment.payRate,
              startDate: activeAssignment.startDate,
            }
          : null,
        licence: primaryLicence
          ? {
              type: primaryLicence.licenceType,
              number: primaryLicence.licenceNumber,
              expiryDate: primaryLicence.expiryDate,
              status: primaryLicence.status,
            }
          : null,
      };
    });

    return {
      items: itemsWithDetails,
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
    const activeAssignment = await this.db.findActiveAssignmentByEmployeeId(companyId, id);

    return {
      ...employee,
      licences,
      currentAssignment: activeAssignment
        ? {
            id: activeAssignment.id,
            siteId: activeAssignment.siteJob?.site?.id,
            siteName: activeAssignment.siteJob?.site?.name,
            siteCode: activeAssignment.siteJob?.site?.code,
            role: activeAssignment.siteJob?.jobType?.name,
            payRate: activeAssignment.payRate,
            startDate: activeAssignment.startDate,
          }
        : null,
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
      accountStatus: 'invited',
      employmentStartDate: dto.employmentStartDate,
    });

    // 3. Optional initial licence creation
    let createdLicence: LicenceEntity | null = null;
    if (dto.initialLicence) {
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

  /**
   * Atomic 5-Step Employee Onboarding Flow (Spec Section 18-20, Phase 3)
   */
  async onboard(companyId: string, actorId: string, actorName: string, dto: OnboardEmployeeDto) {
    const company = await this.db.findCompanyById(companyId);
    if (!company) {
      throw new NotFoundException(`Company '${companyId}' not found.`);
    }

    const email = dto.email.toLowerCase().trim();

    // 1. Generate or validate employee number
    let employeeNumber = dto.employeeNumber?.trim();
    if (!employeeNumber) {
      const year = new Date().getFullYear();
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      employeeNumber = `EMP-${year}-${randomSuffix}`;
    }

    const existingNum = await this.db.findEmployeeByNumber(companyId, employeeNumber);
    if (existingNum) {
      throw new ConflictException(
        `Employee ID '${employeeNumber}' is already assigned to another workforce record in this company.`
      );
    }

    const existingEmployees = await this.db.findEmployees(companyId, { search: email });
    const duplicateEmail = existingEmployees.items.find(
      (e) => e.email.toLowerCase() === email
    );
    if (duplicateEmail) {
      throw new ConflictException(
        `An employee with email '${email}' already exists in this company (ID: ${duplicateEmail.employeeNumber}).`
      );
    }

    const shouldSendInvite = dto.sendInvitation !== false;
    const accountStatus = shouldSendInvite ? 'invited' : 'active';

    // 2. Create permanent employee entity
    const employee = await this.db.createEmployee({
      companyId,
      employeeNumber,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      phone: dto.phone.trim(),
      dateOfBirth: dto.dateOfBirth,
      address: dto.address,
      emergencyContact: dto.emergencyContact,
      employmentStatus: (dto.employmentStatus as EmploymentStatus) || 'active',
      accountStatus,
      employmentStartDate: dto.employmentStartDate,
    });

    // 3. Optional initial licence creation
    let createdLicence: LicenceEntity | null = null;
    if (dto.initialLicence) {
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

    // 4. Optional initial assignment
    let createdAssignment: any = null;
    if (dto.initialAssignment && dto.initialAssignment.siteJobId) {
      createdAssignment = await this.assignmentsService.create(
        companyId,
        {
          employeeId: employee.id,
          siteJobId: dto.initialAssignment.siteJobId,
          payRate: dto.initialAssignment.payRate,
          startDate: dto.initialAssignment.startDate || dto.employmentStartDate,
        },
        actorId
      );
    }

    // 5. Send Brevo invitation email if requested
    let invitationRecord: any = null;
    if (shouldSendInvite) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      invitationRecord = await this.db.createInvitation({
        companyId,
        email,
        role: 'Employee',
        targetType: 'employee',
        targetId: employee.id,
        tokenHash,
        status: 'pending',
        expiresAt,
        invitedBy: actorId,
      });

      await this.brevoService.sendInvitationEmail({
        to: email,
        recipientName: `${employee.firstName} ${employee.lastName}`,
        companyName: company.name,
        role: 'Employee',
        activationToken: rawToken,
        expiresHours: 168,
      });
    }

    // 6. Record audit log
    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'EMPLOYEE_ONBOARDED',
      entity: 'employees',
      entityId: employee.id,
      newValue: {
        employeeNumber: employee.employeeNumber,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        assignedSiteJobId: dto.initialAssignment?.siteJobId || null,
        inviteSent: shouldSendInvite,
      },
    });

    return {
      message: shouldSendInvite
        ? `Employee ${employee.firstName} ${employee.lastName} onboarded and invitation email sent to ${employee.email}.`
        : `Employee ${employee.firstName} ${employee.lastName} onboarded successfully.`,
      employee,
      licence: createdLicence,
      assignment: createdAssignment,
      invitation: invitationRecord
        ? {
            id: invitationRecord.id,
            email: invitationRecord.email,
            status: invitationRecord.status,
            expiresAt: invitationRecord.expiresAt,
          }
        : null,
    };
  }

  /**
   * Resend invitation to an employee who hasn't activated yet
   */
  async resendInvite(companyId: string, actorId: string, id: string) {
    const employee = await this.db.findEmployeeById(companyId, id);
    if (!employee) {
      throw new NotFoundException(`Employee '${id}' not found.`);
    }

    if (employee.userId || employee.accountStatus === 'active') {
      throw new BadRequestException(
        `Employee '${employee.firstName} ${employee.lastName}' has already activated their account.`
      );
    }

    const company = await this.db.findCompanyById(companyId);
    if (!company) {
      throw new NotFoundException(`Company '${companyId}' not found.`);
    }

    // Expire existing pending invitations
    const companyInvitations = await this.db.findInvitationsByCompany(companyId);
    const existing = companyInvitations.filter(
      (inv) =>
        (inv.targetId === employee.id || inv.email.toLowerCase() === employee.email.toLowerCase()) &&
        inv.status === 'pending'
    );
    for (const inv of existing) {
      await this.db.updateInvitationStatus(inv.id, 'expired');
    }

    // Generate new secure invitation
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const newInvite = await this.db.createInvitation({
      companyId,
      email: employee.email,
      role: 'Employee',
      targetType: 'employee',
      targetId: employee.id,
      tokenHash,
      status: 'pending',
      expiresAt,
      invitedBy: actorId,
    });

    await this.db.updateEmployee(companyId, employee.id, {
      accountStatus: 'invited',
    });

    await this.brevoService.sendInvitationEmail({
      to: employee.email,
      recipientName: `${employee.firstName} ${employee.lastName}`,
      companyName: company.name,
      role: 'Employee',
      activationToken: rawToken,
      expiresHours: 168,
    });

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'EMPLOYEE_INVITATION_RESENT',
      entity: 'invitations',
      entityId: newInvite.id,
      newValue: {
        employeeId: employee.id,
        email: employee.email,
      },
    });

    return {
      message: `Invitation successfully resent to ${employee.email}`,
      invitationId: newInvite.id,
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
