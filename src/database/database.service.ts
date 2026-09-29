import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Role } from '../common/enums/role.enum';
import { randomUUID } from 'crypto';
import WebSocket from 'ws';

export interface CompanyEntity {
  id: string;
  name: string;
  slug: string;
  registrationNumber?: string;
  status: 'active' | 'suspended' | 'cancelled';
  subscriptionTier: 'standard' | 'pro' | 'enterprise';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyMemberEntity {
  id: string;
  companyId: string;
  userId: string;
  role: Role;
  status: 'active' | 'invited' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogEntity {
  id: string;
  companyId: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface EmployeeAddress {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export type EmploymentStatus = 'active' | 'probation' | 'suspended' | 'terminated' | 'on_leave';

export interface EmployeeEntity {
  id: string;
  companyId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: EmployeeAddress;
  emergencyContact: EmergencyContact;
  employmentStatus: EmploymentStatus;
  employmentStartDate: string;
  employmentEndDate?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type LicenceStatus = 'valid' | 'expiring_soon' | 'expired' | 'pending_verification' | 'rejected';

export interface LicenceEntity {
  id: string;
  companyId: string;
  employeeId: string;
  licenceType: string;
  licenceNumber: string;
  expiryDate: string;
  status: LicenceStatus;
  verifiedAt?: Date;
  verifiedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteEntity {
  id: string;
  companyId: string;
  name: string;
  code: string;
  address: { line1: string; line2?: string; city: string; postalCode: string; country: string };
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  latitude?: number;
  longitude?: number;
  geofenceRadius?: number; // In meters, default 200m (Section 41)
  status: 'active' | 'inactive' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface JobTypeEntity {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteJobEntity {
  id: string;
  companyId: string;
  siteId: string;
  jobTypeId: string;
  defaultPayRate: number;
  billingRate: number;
  currency: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentEntity {
  id: string;
  companyId: string;
  employeeId: string;
  siteJobId: string;
  payRate: number;
  startDate: string;
  endDate?: string;
  status: 'active' | 'completed' | 'transferred' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export type ShiftStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface ShiftEntity {
  id: string;
  companyId: string;
  siteId: string;
  siteJobId: string;
  employeeId?: string; // undefined = Open Position
  shiftDate: string; // 'YYYY-MM-DD'
  startTime: string; // '06:00'
  endTime: string;   // '18:00'
  breakMinutes: number;
  status: ShiftStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AttendanceStatus = 'clocked_in' | 'on_break' | 'clocked_out' | 'reconciled' | 'flagged' | 'rejected';
export type VarianceFlag = 'none' | 'late_arrival' | 'early_departure' | 'out_of_geofence' | 'overtime' | 'unmatched_shift';

export interface AttendanceEntity {
  id: string;
  companyId: string;
  shiftId?: string;
  employeeId: string;
  siteId: string;
  clockInTime: Date;
  clockOutTime?: Date;
  clockInLat?: number;
  clockInLng?: number;
  clockInAccuracy?: number;
  clockInDistance?: number;
  clockInVerified: boolean;
  clockOutLat?: number;
  clockOutLng?: number;
  clockOutAccuracy?: number;
  clockOutDistance?: number;
  clockOutVerified: boolean;
  breakStartTime?: Date;
  breakEndTime?: Date;
  breakMinutes: number;
  totalHours: number;
  status: AttendanceStatus;
  varianceFlag: VarianceFlag;
  supervisorNotes?: string;
  reconciledBy?: string;
  reconciledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  public supabase: SupabaseClient | null = null;

  // Resilient repository store ensuring zero runtime crashes with placeholder keys
  private companies: Map<string, CompanyEntity> = new Map();
  private users: Map<string, UserEntity> = new Map();
  private companyMembers: Map<string, CompanyMemberEntity> = new Map();
  private auditLogs: AuditLogEntity[] = [];
  private employees: Map<string, EmployeeEntity> = new Map();
  private licences: Map<string, LicenceEntity> = new Map();
  private sites: Map<string, SiteEntity> = new Map();
  private jobTypes: Map<string, JobTypeEntity> = new Map();
  private siteJobs: Map<string, SiteJobEntity> = new Map();
  private assignments: Map<string, AssignmentEntity> = new Map();
  private shifts: Map<string, ShiftEntity> = new Map();
  private attendanceRecords: Map<string, AttendanceEntity> = new Map();

  constructor(@Optional() private configService?: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService?.get<string>('database.supabaseUrl');
    const supabaseKey = this.configService?.get<string>('database.supabaseKey');

    if (
      supabaseUrl &&
      supabaseKey &&
      !supabaseUrl.includes('placeholder') &&
      !supabaseKey.includes('placeholder')
    ) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
          realtime: { transport: WebSocket as any },
        });
        this.logger.log('Connected to Supabase PostgreSQL cluster.');
      } catch (err: any) {
        this.logger.warn(`Supabase client initialization deferred: ${err.message}`);
      }
    } else {
      this.logger.log('Running in decoupled memory storage mode with placeholder credentials.');
    }
  }

  // --- USER OPERATIONS ---
  async findUserByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  async findUserById(id: string): Promise<UserEntity | null> {
    return this.users.get(id) || null;
  }

  async createUser(data: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserEntity> {
    const id = randomUUID();
    const now = new Date();
    const user: UserEntity = {
      ...data,
      id,
      email: data.email.toLowerCase().trim(),
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  // --- COMPANY OPERATIONS ---
  async findCompanyById(id: string): Promise<CompanyEntity | null> {
    return this.companies.get(id) || null;
  }

  async findCompanyBySlug(slug: string): Promise<CompanyEntity | null> {
    const normalized = slug.toLowerCase().trim();
    for (const c of this.companies.values()) {
      if (c.slug.toLowerCase() === normalized) {
        return c;
      }
    }
    return null;
  }

  async createCompany(data: Omit<CompanyEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<CompanyEntity> {
    const id = randomUUID();
    const now = new Date();
    const company: CompanyEntity = {
      ...data,
      id,
      slug: data.slug.toLowerCase().trim(),
      createdAt: now,
      updatedAt: now,
    };
    this.companies.set(id, company);
    return company;
  }

  // --- MEMBERSHIP OPERATIONS ---
  async createCompanyMember(
    data: Omit<CompanyMemberEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<CompanyMemberEntity> {
    const id = randomUUID();
    const now = new Date();
    const member: CompanyMemberEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.companyMembers.set(id, member);
    return member;
  }

  async findCompanyMember(companyId: string, userId: string): Promise<CompanyMemberEntity | null> {
    for (const m of this.companyMembers.values()) {
      if (m.companyId === companyId && m.userId === userId) {
        return m;
      }
    }
    return null;
  }

  async findMembershipsByUserId(userId: string): Promise<CompanyMemberEntity[]> {
    const results: CompanyMemberEntity[] = [];
    for (const m of this.companyMembers.values()) {
      if (m.userId === userId && m.status === 'active') {
        results.push(m);
      }
    }
    return results;
  }

  async findMembersByCompanyId(
    companyId: string
  ): Promise<Array<CompanyMemberEntity & { user: Omit<UserEntity, 'passwordHash'> }>> {
    const results: Array<CompanyMemberEntity & { user: Omit<UserEntity, 'passwordHash'> }> = [];
    for (const m of this.companyMembers.values()) {
      if (m.companyId === companyId) {
        const user = await this.findUserById(m.userId);
        if (user) {
          const { passwordHash, ...safeUser } = user;
          results.push({ ...m, user: safeUser });
        }
      }
    }
    return results;
  }

  // --- AUDIT LOGS ---
  async recordAudit(data: Omit<AuditLogEntity, 'id' | 'createdAt'>): Promise<AuditLogEntity> {
    const id = randomUUID();
    const log: AuditLogEntity = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.auditLogs.push(log);
    this.logger.log(`[AUDIT] Company:${data.companyId} | Action:${data.action} | Entity:${data.entity}`);
    return log;
  }

  async getAuditLogs(companyId: string, limit = 50): Promise<AuditLogEntity[]> {
    return this.auditLogs
      .filter((l) => l.companyId === companyId)
      .slice(-limit)
      .reverse();
  }

  // --- EMPLOYEE OPERATIONS (SECTION 18, 20) ---
  async findEmployees(
    companyId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      status?: EmploymentStatus | 'all';
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ items: EmployeeEntity[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const search = options.search?.toLowerCase().trim();
    const status = options.status && options.status !== 'all' ? options.status : null;

    let filtered = Array.from(this.employees.values()).filter(
      (emp) => emp.companyId === companyId
    );

    if (status) {
      filtered = filtered.filter((emp) => emp.employmentStatus === status);
    }

    if (search) {
      filtered = filtered.filter((emp) => {
        const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
        return (
          fullName.includes(search) ||
          emp.employeeNumber.toLowerCase().includes(search) ||
          emp.email.toLowerCase().includes(search) ||
          emp.phone.toLowerCase().includes(search)
        );
      });
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;

    // Sorting
    const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
      if (options.sortBy === 'name') {
        return a.lastName.localeCompare(b.lastName) * sortOrder;
      }
      if (options.sortBy === 'number') {
        return a.employeeNumber.localeCompare(b.employeeNumber) * sortOrder;
      }
      return (b.createdAt.getTime() - a.createdAt.getTime()) * sortOrder;
    });

    const startIndex = (page - 1) * limit;
    const items = filtered.slice(startIndex, startIndex + limit);

    return { items, total, page, totalPages };
  }

  async findEmployeeById(companyId: string, id: string): Promise<EmployeeEntity | null> {
    const emp = this.employees.get(id);
    if (!emp || emp.companyId !== companyId) {
      return null;
    }
    return emp;
  }

  async findEmployeeByNumber(companyId: string, employeeNumber: string): Promise<EmployeeEntity | null> {
    const normalized = employeeNumber.toUpperCase().trim();
    for (const emp of this.employees.values()) {
      if (emp.companyId === companyId && emp.employeeNumber.toUpperCase() === normalized) {
        return emp;
      }
    }
    return null;
  }

  async createEmployee(
    data: Omit<EmployeeEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<EmployeeEntity> {
    const id = randomUUID();
    const now = new Date();
    const employee: EmployeeEntity = {
      ...data,
      id,
      employeeNumber: data.employeeNumber.toUpperCase().trim(),
      createdAt: now,
      updatedAt: now,
    };
    this.employees.set(id, employee);
    return employee;
  }

  async updateEmployee(
    companyId: string,
    id: string,
    updates: Partial<Omit<EmployeeEntity, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>
  ): Promise<EmployeeEntity | null> {
    const emp = await this.findEmployeeById(companyId, id);
    if (!emp) return null;

    const updated: EmployeeEntity = {
      ...emp,
      ...updates,
      updatedAt: new Date(),
    };
    this.employees.set(id, updated);
    return updated;
  }

  // --- LICENCE OPERATIONS (SECTION 42) ---
  async createLicence(
    data: Omit<LicenceEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LicenceEntity> {
    const id = randomUUID();
    const now = new Date();
    const licence: LicenceEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.licences.set(id, licence);
    return licence;
  }

  async findLicencesByEmployeeId(companyId: string, employeeId: string): Promise<LicenceEntity[]> {
    const results: LicenceEntity[] = [];
    for (const lic of this.licences.values()) {
      if (lic.companyId === companyId && lic.employeeId === employeeId) {
        results.push(lic);
      }
    }
    return results;
  }

  // --- SITE OPERATIONS (SECTION 17, 21) ---
  async findSites(companyId: string): Promise<SiteEntity[]> {
    return Array.from(this.sites.values())
      .filter((s) => s.companyId === companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findSiteById(companyId: string, id: string): Promise<SiteEntity | null> {
    const site = this.sites.get(id);
    if (!site || site.companyId !== companyId) return null;
    return site;
  }

  async findSiteByCode(companyId: string, code: string): Promise<SiteEntity | null> {
    const normalized = code.toUpperCase().trim();
    for (const s of this.sites.values()) {
      if (s.companyId === companyId && s.code.toUpperCase() === normalized) {
        return s;
      }
    }
    return null;
  }

  async createSite(data: Omit<SiteEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<SiteEntity> {
    const id = randomUUID();
    const now = new Date();
    const site: SiteEntity = {
      ...data,
      id,
      code: data.code.toUpperCase().trim(),
      createdAt: now,
      updatedAt: now,
    };
    this.sites.set(id, site);
    return site;
  }

  async updateSite(
    companyId: string,
    id: string,
    updates: Partial<Omit<SiteEntity, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>
  ): Promise<SiteEntity | null> {
    const site = await this.findSiteById(companyId, id);
    if (!site) return null;

    const updated: SiteEntity = {
      ...site,
      ...updates,
      updatedAt: new Date(),
    };
    this.sites.set(id, updated);
    return updated;
  }

  // --- JOB TYPE OPERATIONS (SECTION 21) ---
  async findJobTypes(companyId: string): Promise<JobTypeEntity[]> {
    return Array.from(this.jobTypes.values())
      .filter((j) => j.companyId === companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findJobTypeById(companyId: string, id: string): Promise<JobTypeEntity | null> {
    const job = this.jobTypes.get(id);
    if (!job || job.companyId !== companyId) return null;
    return job;
  }

  async findJobTypeByName(companyId: string, name: string): Promise<JobTypeEntity | null> {
    const normalized = name.toLowerCase().trim();
    for (const j of this.jobTypes.values()) {
      if (j.companyId === companyId && j.name.toLowerCase() === normalized) {
        return j;
      }
    }
    return null;
  }

  async createJobType(data: Omit<JobTypeEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<JobTypeEntity> {
    const id = randomUUID();
    const now = new Date();
    const job: JobTypeEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.jobTypes.set(id, job);
    return job;
  }

  // --- SITE JOBS & RATES (SECTION 21) ---
  async findSiteJobs(
    companyId: string,
    siteId: string
  ): Promise<Array<SiteJobEntity & { jobType: JobTypeEntity }>> {
    const results: Array<SiteJobEntity & { jobType: JobTypeEntity }> = [];
    for (const sj of this.siteJobs.values()) {
      if (sj.companyId === companyId && sj.siteId === siteId) {
        const jobType = await this.findJobTypeById(companyId, sj.jobTypeId);
        if (jobType) {
          results.push({ ...sj, jobType });
        }
      }
    }
    return results;
  }

  async findSiteJobById(companyId: string, id: string): Promise<SiteJobEntity | null> {
    const sj = this.siteJobs.get(id);
    if (!sj || sj.companyId !== companyId) return null;
    return sj;
  }

  async findSiteJobByPair(
    companyId: string,
    siteId: string,
    jobTypeId: string
  ): Promise<SiteJobEntity | null> {
    for (const sj of this.siteJobs.values()) {
      if (sj.companyId === companyId && sj.siteId === siteId && sj.jobTypeId === jobTypeId) {
        return sj;
      }
    }
    return null;
  }

  async createSiteJob(
    data: Omit<SiteJobEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<SiteJobEntity> {
    const id = randomUUID();
    const now = new Date();
    const siteJob: SiteJobEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.siteJobs.set(id, siteJob);
    return siteJob;
  }

  async updateSiteJob(
    companyId: string,
    id: string,
    updates: Partial<Omit<SiteJobEntity, 'id' | 'companyId' | 'siteId' | 'jobTypeId' | 'createdAt' | 'updatedAt'>>
  ): Promise<SiteJobEntity | null> {
    const sj = await this.findSiteJobById(companyId, id);
    if (!sj) return null;

    const updated: SiteJobEntity = {
      ...sj,
      ...updates,
      updatedAt: new Date(),
    };
    this.siteJobs.set(id, updated);
    return updated;
  }

  // --- ASSIGNMENT OPERATIONS (SECTION 22, 37, 38) ---
  async createAssignment(
    data: Omit<AssignmentEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AssignmentEntity> {
    const id = randomUUID();
    const now = new Date();
    const assignment: AssignmentEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.assignments.set(id, assignment);
    return assignment;
  }

  async findAssignmentById(companyId: string, id: string): Promise<AssignmentEntity | null> {
    const assignment = this.assignments.get(id);
    if (!assignment || assignment.companyId !== companyId) return null;
    return assignment;
  }

  async findAssignmentsByEmployeeId(
    companyId: string,
    employeeId: string
  ): Promise<Array<AssignmentEntity & { siteJob: SiteJobEntity & { site: SiteEntity; jobType: JobTypeEntity } }>> {
    const results: Array<AssignmentEntity & { siteJob: SiteJobEntity & { site: SiteEntity; jobType: JobTypeEntity } }> = [];
    for (const a of this.assignments.values()) {
      if (a.companyId === companyId && a.employeeId === employeeId) {
        const siteJob = await this.findSiteJobById(companyId, a.siteJobId);
        if (siteJob) {
          const site = await this.findSiteById(companyId, siteJob.siteId);
          const jobType = await this.findJobTypeById(companyId, siteJob.jobTypeId);
          if (site && jobType) {
            results.push({
              ...a,
              siteJob: { ...siteJob, site, jobType },
            });
          }
        }
      }
    }
    return results.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }

  async findActiveAssignmentByEmployeeId(
    companyId: string,
    employeeId: string
  ): Promise<(AssignmentEntity & { siteJob: SiteJobEntity & { site: SiteEntity; jobType: JobTypeEntity } }) | null> {
    const list = await this.findAssignmentsByEmployeeId(companyId, employeeId);
    return list.find((a) => a.status === 'active') || null;
  }

  async closeAssignment(
    companyId: string,
    id: string,
    endDate: string,
    status: 'completed' | 'transferred' | 'cancelled' = 'completed'
  ): Promise<AssignmentEntity | null> {
    const assignment = await this.findAssignmentById(companyId, id);
    if (!assignment) return null;

    const updated: AssignmentEntity = {
      ...assignment,
      endDate,
      status,
      updatedAt: new Date(),
    };
    this.assignments.set(id, updated);
    return updated;
  }

  // --- SHIFT OPERATIONS (SECTION 39, 40) ---
  async createShift(
    data: Omit<ShiftEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ShiftEntity> {
    const id = randomUUID();
    const now = new Date();
    const shift: ShiftEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.shifts.set(id, shift);
    return shift;
  }

  async findShiftById(companyId: string, id: string): Promise<ShiftEntity | null> {
    const shift = this.shifts.get(id);
    if (!shift || shift.companyId !== companyId) return null;
    return shift;
  }

  async updateShift(
    companyId: string,
    id: string,
    updates: Partial<Omit<ShiftEntity, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ShiftEntity | null> {
    const shift = await this.findShiftById(companyId, id);
    if (!shift) return null;

    const updated: ShiftEntity = {
      ...shift,
      ...updates,
      updatedAt: new Date(),
    };
    this.shifts.set(id, updated);
    return updated;
  }

  async deleteShift(companyId: string, id: string): Promise<boolean> {
    const shift = await this.findShiftById(companyId, id);
    if (!shift) return false;
    this.shifts.delete(id);
    return true;
  }

  async findShifts(
    companyId: string,
    filters: {
      siteId?: string;
      employeeId?: string;
      startDate?: string;
      endDate?: string;
      status?: ShiftStatus | 'all';
    } = {}
  ): Promise<
    Array<
      ShiftEntity & {
        site: SiteEntity;
        siteJob: SiteJobEntity & { jobType: JobTypeEntity };
        employee?: EmployeeEntity;
      }
    >
  > {
    const results: Array<
      ShiftEntity & {
        site: SiteEntity;
        siteJob: SiteJobEntity & { jobType: JobTypeEntity };
        employee?: EmployeeEntity;
      }
    > = [];

    for (const shift of this.shifts.values()) {
      if (shift.companyId !== companyId) continue;
      if (filters.siteId && shift.siteId !== filters.siteId) continue;
      if (filters.employeeId && shift.employeeId !== filters.employeeId) continue;
      if (filters.status && filters.status !== 'all' && shift.status !== filters.status) continue;
      if (filters.startDate && shift.shiftDate < filters.startDate) continue;
      if (filters.endDate && shift.shiftDate > filters.endDate) continue;

      const site = await this.findSiteById(companyId, shift.siteId);
      const siteJob = await this.findSiteJobById(companyId, shift.siteJobId);
      if (site && siteJob) {
        const jobType = await this.findJobTypeById(companyId, siteJob.jobTypeId);
        if (jobType) {
          let employee: EmployeeEntity | undefined = undefined;
          if (shift.employeeId) {
            const emp = await this.findEmployeeById(companyId, shift.employeeId);
            if (emp) employee = emp;
          }

          results.push({
            ...shift,
            site,
            siteJob: { ...siteJob, jobType },
            employee,
          });
        }
      }
    }

    return results.sort((a, b) => {
      if (a.shiftDate !== b.shiftDate) {
        return a.shiftDate.localeCompare(b.shiftDate);
      }
      return a.startTime.localeCompare(b.startTime);
    });
  }

  async findConflictingShifts(
    companyId: string,
    employeeId: string,
    shiftDate: string,
    startTime: string,
    endTime: string,
    excludeShiftId?: string
  ): Promise<ShiftEntity[]> {
    const conflicts: ShiftEntity[] = [];

    for (const s of this.shifts.values()) {
      if (s.companyId !== companyId) continue;
      if (s.employeeId !== employeeId) continue;
      if (s.status === 'cancelled') continue;
      if (excludeShiftId && s.id === excludeShiftId) continue;
      if (s.shiftDate !== shiftDate) continue;

      // Overlap check on 24-hr time strings: (startA < endB && endA > startB)
      if (startTime < s.endTime && endTime > s.startTime) {
        conflicts.push(s);
      }
    }

    return conflicts;
  }

  // --- ATTENDANCE OPERATIONS (SECTION 41, 42, 43, 44) ---
  async createAttendanceRecord(
    data: Omit<AttendanceEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AttendanceEntity> {
    const id = randomUUID();
    const now = new Date();
    const record: AttendanceEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.attendanceRecords.set(id, record);
    return record;
  }

  async findAttendanceById(companyId: string, id: string): Promise<AttendanceEntity | null> {
    const record = this.attendanceRecords.get(id);
    if (!record || record.companyId !== companyId) return null;
    return record;
  }

  async updateAttendanceRecord(
    companyId: string,
    id: string,
    updates: Partial<Omit<AttendanceEntity, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>
  ): Promise<AttendanceEntity | null> {
    const record = await this.findAttendanceById(companyId, id);
    if (!record) return null;

    const updated: AttendanceEntity = {
      ...record,
      ...updates,
      updatedAt: new Date(),
    };
    this.attendanceRecords.set(id, updated);
    return updated;
  }

  async findActiveAttendanceByEmployee(
    companyId: string,
    employeeId: string
  ): Promise<AttendanceEntity | null> {
    for (const record of this.attendanceRecords.values()) {
      if (
        record.companyId === companyId &&
        record.employeeId === employeeId &&
        (record.status === 'clocked_in' || record.status === 'on_break')
      ) {
        return record;
      }
    }
    return null;
  }

  async findAttendanceRecords(
    companyId: string,
    filters: {
      employeeId?: string;
      siteId?: string;
      startDate?: string;
      endDate?: string;
      status?: AttendanceStatus | 'all';
      varianceFlag?: VarianceFlag | 'all';
    } = {}
  ): Promise<
    Array<
      AttendanceEntity & {
        employee: EmployeeEntity;
        site: SiteEntity;
        shift?: ShiftEntity;
      }
    >
  > {
    const results: Array<
      AttendanceEntity & {
        employee: EmployeeEntity;
        site: SiteEntity;
        shift?: ShiftEntity;
      }
    > = [];

    for (const record of this.attendanceRecords.values()) {
      if (record.companyId !== companyId) continue;
      if (filters.employeeId && record.employeeId !== filters.employeeId) continue;
      if (filters.siteId && record.siteId !== filters.siteId) continue;
      if (filters.status && filters.status !== 'all' && record.status !== filters.status) continue;
      if (filters.varianceFlag && filters.varianceFlag !== 'all' && record.varianceFlag !== filters.varianceFlag) continue;

      const clockInDateStr = record.clockInTime.toISOString().split('T')[0];
      if (filters.startDate && clockInDateStr < filters.startDate) continue;
      if (filters.endDate && clockInDateStr > filters.endDate) continue;

      const employee = await this.findEmployeeById(companyId, record.employeeId);
      const site = await this.findSiteById(companyId, record.siteId);
      if (employee && site) {
        let shift: ShiftEntity | undefined = undefined;
        if (record.shiftId) {
          const s = await this.findShiftById(companyId, record.shiftId);
          if (s) shift = s;
        }

        results.push({
          ...record,
          employee,
          site,
          shift,
        });
      }
    }

    return results.sort((a, b) => b.clockInTime.getTime() - a.clockInTime.getTime());
  }
}
