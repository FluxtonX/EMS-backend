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

export type AccountStatus = 'invited' | 'active' | 'suspended' | 'disabled';

export interface EmployeeEntity {
  id: string;
  companyId: string;
  userId?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: EmployeeAddress;
  emergencyContact: EmergencyContact;
  employmentStatus: EmploymentStatus;
  accountStatus?: AccountStatus;
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

export interface DocumentEntity {
  id: string;
  companyId: string;
  employeeId: string;
  documentType: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  isVerified: boolean;
  verifiedAt?: Date;
  verifiedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatConversationEntity {
  id: string;
  companyId: string;
  employeeId: string;
  createdBy?: string;
  lastMessageAt: Date;
  lastMessagePreview?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageEntity {
  id: string;
  conversationId: string;
  companyId: string;
  senderId: string;
  senderRole: 'COMPANY' | 'EMPLOYEE';
  senderName: string;
  content: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
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

// --- Phase 9: Leave & Availability ---

export type LeaveType = 'annual' | 'sick' | 'emergency' | 'unpaid' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequestEntity {
  id: string;
  companyId: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  totalDays: number;
  reason?: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface AvailabilityEntity {
  id: string;
  companyId: string;
  employeeId: string;
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  preferredStartTime?: string; // 'HH:mm'
  preferredEndTime?: string;   // 'HH:mm'
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType =
  | 'licence_expiry'
  | 'shift_assigned'
  | 'shift_reminder'
  | 'leave_decision'
  | 'account_event'
  | 'compliance_alert'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationStatus = 'unread' | 'read' | 'archived';

export interface NotificationEntity {
  id: string;
  companyId: string;
  userId?: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  status: NotificationStatus;
  actionUrl?: string;
  metadata?: Record<string, any>;
  emailSent: boolean;
  emailSentAt?: Date;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'locked' | 'rejected';

export interface TimesheetEntity {
  id: string;
  companyId: string;
  employeeId: string;
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string;   // 'YYYY-MM-DD'
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  breakMinutes: number;
  grossPay: number;
  currency: string;
  status: TimesheetStatus;
  approvedBy?: string;
  approvedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimesheetEntryEntity {
  id: string;
  timesheetId: string;
  attendanceRecordId?: string;
  shiftId?: string;
  siteId: string;
  entryDate: string; // 'YYYY-MM-DD'
  clockIn: Date;
  clockOut: Date;
  breakMinutes: number;
  grossHours: number;
  netHours: number;
  payRate: number;
  totalPay: number;
  isOvertime: boolean;
  adjustmentMinutes: number;
  adjustmentReason?: string;
  adjustedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// --- Phase 13: Pay Runs & Payslips ---

export type PayRunStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'cancelled';
export type PayFrequency = 'weekly' | 'bi_weekly' | 'monthly';
export type PayslipStatus = 'draft' | 'published' | 'paid';

export interface PayRunEntity {
  id: string;
  companyId: string;
  name: string;
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string;   // 'YYYY-MM-DD'
  paymentDate: string; // 'YYYY-MM-DD'
  frequency: PayFrequency;
  status: PayRunStatus;
  totalGross: number;
  totalTax: number;
  totalNi: number;
  totalNet: number;
  totalEmployees: number;
  currency: string;
  approvedBy?: string;
  approvedAt?: Date;
  paidAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayslipEntity {
  id: string;
  companyId: string;
  payRunId: string;
  employeeId: string;
  timesheetId?: string;
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string;   // 'YYYY-MM-DD'
  paymentDate: string; // 'YYYY-MM-DD'
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  taxDeduction: number;
  nationalInsurance: number;
  otherDeductions: number;
  netPay: number;
  currency: string;
  status: PayslipStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// --- Phase 14: Clients, Contracts & Invoicing ---

export interface ClientEntity {
  id: string;
  companyId: string;
  name: string;
  companyNumber?: string;
  vatNumber?: string;
  billingEmail: string;
  phone?: string;
  address?: string;
  status: 'active' | 'inactive';
  paymentTermsDays: number;
  currency: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractEntity {
  id: string;
  companyId: string;
  clientId: string;
  siteId: string;
  contractNumber: string;
  title: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate?: string;
  billingCycle: 'weekly' | 'bi_weekly' | 'monthly';
  hourlyBillingRate: number;
  status: 'active' | 'expired' | 'terminated';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export interface InvoiceEntity {
  id: string;
  companyId: string;
  clientId: string;
  contractId?: string;
  invoiceNumber: string;
  issueDate: string; // 'YYYY-MM-DD'
  dueDate: string;   // 'YYYY-MM-DD'
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  status: InvoiceStatus;
  paidAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItemEntity {
  id: string;
  invoiceId: string;
  siteId?: string;
  jobTypeId?: string;
  description: string;
  hours: number;
  rate: number;
  totalAmount: number;
  createdAt: Date;
}

// --- Phase 1: Invitations & User Devices (Spec Sections 11, 16, 28) ---

export type InvitationStatus = 'pending' | 'sent' | 'accepted' | 'expired' | 'cancelled';
export type InvitationTargetType = 'team_member' | 'employee';

export interface InvitationEntity {
  id: string;
  companyId: string;
  email: string;
  role: string;
  targetType: InvitationTargetType;
  targetId?: string;
  tokenHash: string;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt?: Date;
  invitedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DeviceType = 'web' | 'android' | 'ios';

export interface UserDeviceEntity {
  id: string;
  userId: string;
  deviceType: DeviceType;
  platform?: string;
  pushToken: string;
  lastSeenAt: Date;
  revokedAt?: Date;
  createdAt: Date;
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  public supabase: SupabaseClient | null = null;

  // In-memory fallback cache (preserves zero-crash offline execution and instant test runs)
  private companies: Map<string, CompanyEntity> = new Map();
  private users: Map<string, UserEntity> = new Map();
  private companyMembers: Map<string, CompanyMemberEntity> = new Map();
  private auditLogs: AuditLogEntity[] = [];
  private employees: Map<string, EmployeeEntity> = new Map();
  private invitations: Map<string, InvitationEntity> = new Map();
  private userDevices: Map<string, UserDeviceEntity> = new Map();
  private licences: Map<string, LicenceEntity> = new Map();
  private documents: Map<string, DocumentEntity> = new Map();
  private sites: Map<string, SiteEntity> = new Map();
  private jobTypes: Map<string, JobTypeEntity> = new Map();
  private siteJobs: Map<string, SiteJobEntity> = new Map();
  private assignments: Map<string, AssignmentEntity> = new Map();
  private shifts: Map<string, ShiftEntity> = new Map();
  private attendanceRecords: Map<string, AttendanceEntity> = new Map();
  private leaveRequests: Map<string, LeaveRequestEntity> = new Map();
  private availabilityRecords: Map<string, AvailabilityEntity> = new Map();
  private notifications: Map<string, NotificationEntity> = new Map();
  private timesheets: Map<string, TimesheetEntity> = new Map();
  private timesheetEntries: Map<string, TimesheetEntryEntity> = new Map();
  private payRuns: Map<string, PayRunEntity> = new Map();
  private payslips: Map<string, PayslipEntity> = new Map();
  private clients: Map<string, ClientEntity> = new Map();
  private contracts: Map<string, ContractEntity> = new Map();
  private invoices: Map<string, InvoiceEntity> = new Map();
  private invoiceItems: Map<string, InvoiceItemEntity> = new Map();
  private chatConversations: Map<string, ChatConversationEntity> = new Map();
  private chatMessages: Map<string, ChatMessageEntity> = new Map();

  constructor(@Optional() private configService?: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService?.get<string>('database.supabaseUrl');
    const supabaseKey = this.configService?.get<string>('database.supabaseKey');

    if (
      process.env.NODE_ENV !== 'test' &&
      process.env.DATABASE_USE_MOCK !== 'true' &&
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
      this.logger.log('Running in decoupled memory storage mode with placeholder credentials or test environment.');
    }
  }

  // --- ENTITY MAPPERS (Database snake_case <-> Application camelCase) ---
  private mapUser(row: any): UserEntity {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone || undefined,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapCompany(row: any): CompanyEntity {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      registrationNumber: row.registration_number || undefined,
      status: row.status,
      subscriptionTier: row.subscription_tier,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapCompanyMember(row: any): CompanyMemberEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapAuditLog(row: any): AuditLogEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id || undefined,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id || undefined,
      oldValue: row.old_value || undefined,
      newValue: row.new_value || undefined,
      ipAddress: row.ip_address || undefined,
      userAgent: row.user_agent || undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private mapEmployee(row: any): EmployeeEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id || undefined,
      employeeNumber: row.employee_number,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      dateOfBirth: row.date_of_birth,
      address: typeof row.address === 'string' ? JSON.parse(row.address) : (row.address || {}),
      emergencyContact: typeof row.emergency_contact === 'string' ? JSON.parse(row.emergency_contact) : (row.emergency_contact || {}),
      employmentStatus: row.employment_status,
      accountStatus: row.account_status || 'invited',
      employmentStartDate: row.employment_start_date,
      employmentEndDate: row.employment_end_date || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapInvitation(row: any): InvitationEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      email: row.email,
      role: row.role,
      targetType: row.target_type,
      targetId: row.target_id || undefined,
      tokenHash: row.token_hash,
      status: row.status,
      expiresAt: new Date(row.expires_at),
      acceptedAt: row.accepted_at ? new Date(row.accepted_at) : undefined,
      invitedBy: row.invited_by || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapUserDevice(row: any): UserDeviceEntity {
    return {
      id: row.id,
      userId: row.user_id,
      deviceType: row.device_type,
      platform: row.platform || undefined,
      pushToken: row.push_token,
      lastSeenAt: new Date(row.last_seen_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private mapLicence(row: any): LicenceEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      licenceType: row.licence_type,
      licenceNumber: row.licence_number,
      expiryDate: row.expiry_date,
      status: row.status,
      verifiedAt: row.verified_at ? new Date(row.verified_at) : undefined,
      verifiedBy: row.verified_by || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapDocument(row: any): DocumentEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      documentType: row.document_type,
      fileName: row.file_name,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes || 0),
      isVerified: Boolean(row.is_verified),
      verifiedAt: row.verified_at ? new Date(row.verified_at) : undefined,
      verifiedBy: row.verified_by || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapSite(row: any): SiteEntity {
    const addr = typeof row.address === 'string' ? JSON.parse(row.address) : (row.address || {});
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      code: row.code,
      address: addr,
      contactName: row.contact_name || undefined,
      contactPhone: row.contact_phone || undefined,
      contactEmail: row.contact_email || undefined,
      latitude: row.latitude ? parseFloat(row.latitude) : (addr.latitude ? parseFloat(addr.latitude) : undefined),
      longitude: row.longitude ? parseFloat(row.longitude) : (addr.longitude ? parseFloat(addr.longitude) : undefined),
      geofenceRadius: row.geofence_radius ? Number(row.geofence_radius) : (addr.geofenceRadius ? Number(addr.geofenceRadius) : 200),
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapJobType(row: any): JobTypeEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      description: row.description || undefined,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapSiteJob(row: any): SiteJobEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      siteId: row.site_id,
      jobTypeId: row.job_type_id,
      defaultPayRate: parseFloat(row.default_pay_rate),
      billingRate: parseFloat(row.billing_rate),
      currency: row.currency || 'GBP',
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapAssignment(row: any): AssignmentEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      siteJobId: row.site_job_id,
      payRate: parseFloat(row.pay_rate),
      startDate: row.start_date,
      endDate: row.end_date || undefined,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapShift(row: any): ShiftEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      siteId: row.site_id,
      siteJobId: row.site_job_id,
      employeeId: row.employee_id || undefined,
      shiftDate: row.shift_date,
      startTime: row.start_time,
      endTime: row.end_time,
      breakMinutes: row.break_minutes || 0,
      status: row.status,
      notes: row.notes || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapAttendance(row: any): AttendanceEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      shiftId: row.shift_id || undefined,
      employeeId: row.employee_id,
      siteId: row.site_id,
      clockInTime: new Date(row.clock_in_time),
      clockOutTime: row.clock_out_time ? new Date(row.clock_out_time) : undefined,
      clockInLat: row.clock_in_lat ? parseFloat(row.clock_in_lat) : undefined,
      clockInLng: row.clock_in_lng ? parseFloat(row.clock_in_lng) : undefined,
      clockInAccuracy: row.clock_in_accuracy ? parseFloat(row.clock_in_accuracy) : undefined,
      clockInDistance: row.clock_in_distance ? parseFloat(row.clock_in_distance) : undefined,
      clockInVerified: Boolean(row.clock_in_verified),
      clockOutLat: row.clock_out_lat ? parseFloat(row.clock_out_lat) : undefined,
      clockOutLng: row.clock_out_lng ? parseFloat(row.clock_out_lng) : undefined,
      clockOutAccuracy: row.clock_out_accuracy ? parseFloat(row.clock_out_accuracy) : undefined,
      clockOutDistance: row.clock_out_distance ? parseFloat(row.clock_out_distance) : undefined,
      clockOutVerified: Boolean(row.clock_out_verified),
      breakStartTime: row.break_start_time ? new Date(row.break_start_time) : undefined,
      breakEndTime: row.break_end_time ? new Date(row.break_end_time) : undefined,
      breakMinutes: row.break_minutes || 0,
      totalHours: row.total_hours ? parseFloat(row.total_hours) : 0,
      status: row.status,
      varianceFlag: row.variance_flag || 'none',
      supervisorNotes: row.supervisor_notes || undefined,
      reconciledBy: row.reconciled_by || undefined,
      reconciledAt: row.reconciled_at ? new Date(row.reconciled_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // --- USER OPERATIONS ---
  async findUserByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.toLowerCase().trim();

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('users')
          .select('*')
          .ilike('email', normalized)
          .maybeSingle();

        if (error) {
          this.logger.error(`Error querying user by email in Supabase: ${error.message}`);
        } else if (data) {
          const user = this.mapUser(data);
          this.users.set(user.id, user);
          return user;
        }
      } catch (err: any) {
        this.logger.error(`Supabase findUserByEmail exception: ${err.message}`);
      }
    }

    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  async findUserById(id: string): Promise<UserEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('users')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) {
          this.logger.error(`Error querying user by id in Supabase: ${error.message}`);
        } else if (data) {
          const user = this.mapUser(data);
          this.users.set(user.id, user);
          return user;
        }
      } catch (err: any) {
        this.logger.error(`Supabase findUserById exception: ${err.message}`);
      }
    }

    return this.users.get(id) || null;
  }

  async createUser(data: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserEntity> {
    const id = randomUUID();
    const now = new Date();
    const normalizedEmail = data.email.toLowerCase().trim();

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('users')
          .insert({
            id,
            email: normalizedEmail,
            password_hash: data.passwordHash,
            first_name: data.firstName.trim(),
            last_name: data.lastName.trim(),
            phone: data.phone || null,
            is_active: data.isActive ?? true,
          })
          .select()
          .single();

        if (error) {
          this.logger.error(`Failed to insert user into Supabase: ${error.message}`);
          throw new Error(`Database user creation failed: ${error.message}`);
        }

        const user = this.mapUser(inserted);
        this.users.set(user.id, user);
        return user;
      } catch (err: any) {
        this.logger.error(`Supabase createUser exception: ${err.message}`);
        throw err;
      }
    }

    const user: UserEntity = {
      ...data,
      id,
      email: normalizedEmail,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  // --- COMPANY OPERATIONS ---
  async findCompanyById(id: string): Promise<CompanyEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('companies')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) {
          this.logger.error(`Error querying company by id in Supabase: ${error.message}`);
        } else if (data) {
          const company = this.mapCompany(data);
          this.companies.set(company.id, company);
          return company;
        }
      } catch (err: any) {
        this.logger.error(`Supabase findCompanyById exception: ${err.message}`);
      }
    }

    return this.companies.get(id) || null;
  }

  async findCompanyBySlug(slug: string): Promise<CompanyEntity | null> {
    const normalized = slug.toLowerCase().trim();

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('companies')
          .select('*')
          .eq('slug', normalized)
          .maybeSingle();

        if (error) {
          this.logger.error(`Error querying company by slug in Supabase: ${error.message}`);
        } else if (data) {
          const company = this.mapCompany(data);
          this.companies.set(company.id, company);
          return company;
        }
      } catch (err: any) {
        this.logger.error(`Supabase findCompanyBySlug exception: ${err.message}`);
      }
    }

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
    const slug = data.slug.toLowerCase().trim();

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('companies')
          .insert({
            id,
            name: data.name.trim(),
            slug,
            registration_number: data.registrationNumber || null,
            status: data.status || 'active',
            subscription_tier: data.subscriptionTier || 'standard',
          })
          .select()
          .single();

        if (error) {
          this.logger.error(`Failed to insert company into Supabase: ${error.message}`);
          throw new Error(`Database company creation failed: ${error.message}`);
        }

        const company = this.mapCompany(inserted);
        this.companies.set(company.id, company);
        return company;
      } catch (err: any) {
        this.logger.error(`Supabase createCompany exception: ${err.message}`);
        throw err;
      }
    }

    const company: CompanyEntity = {
      ...data,
      id,
      slug,
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

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('company_members')
          .insert({
            id,
            company_id: data.companyId,
            user_id: data.userId,
            role: data.role,
            status: data.status || 'active',
          })
          .select()
          .single();

        if (error) {
          this.logger.error(`Failed to insert company member into Supabase: ${error.message}`);
          throw new Error(`Database company membership creation failed: ${error.message}`);
        }

        const member = this.mapCompanyMember(inserted);
        this.companyMembers.set(member.id, member);
        return member;
      } catch (err: any) {
        this.logger.error(`Supabase createCompanyMember exception: ${err.message}`);
        throw err;
      }
    }

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
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('company_members')
          .select('*')
          .eq('company_id', companyId)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          this.logger.error(`Error querying company member in Supabase: ${error.message}`);
        } else if (data) {
          const member = this.mapCompanyMember(data);
          this.companyMembers.set(member.id, member);
          return member;
        }
      } catch (err: any) {
        this.logger.error(`Supabase findCompanyMember exception: ${err.message}`);
      }
    }

    for (const m of this.companyMembers.values()) {
      if (m.companyId === companyId && m.userId === userId) {
        return m;
      }
    }
    return null;
  }

  async findMembershipsByUserId(userId: string): Promise<CompanyMemberEntity[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('company_members')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active');

        if (error) {
          this.logger.error(`Error querying memberships in Supabase: ${error.message}`);
        } else if (data && data.length > 0) {
          return data.map((row) => this.mapCompanyMember(row));
        }
      } catch (err: any) {
        this.logger.error(`Supabase findMembershipsByUserId exception: ${err.message}`);
      }
    }

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

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('company_members')
          .select('*, users(*)')
          .eq('company_id', companyId);

        if (!error && data) {
          for (const row of data) {
            const member = this.mapCompanyMember(row);
            if (row.users) {
              const fullUser = this.mapUser(row.users);
              const { passwordHash, ...safeUser } = fullUser;
              results.push({ ...member, user: safeUser });
            }
          }
          return results;
        }
      } catch (err: any) {
        this.logger.error(`Supabase findMembersByCompanyId exception: ${err.message}`);
      }
    }

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

  async updateCompanyMemberStatus(
    companyId: string,
    memberId: string,
    status: 'active' | 'invited' | 'suspended'
  ): Promise<CompanyMemberEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('company_members')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('company_id', companyId)
          .eq('id', memberId)
          .select()
          .maybeSingle();

        if (!error && data) {
          const m = this.mapCompanyMember(data);
          this.companyMembers.set(m.id, m);
          return m;
        }
      } catch (err: any) {
        this.logger.error(`Supabase updateCompanyMemberStatus exception: ${err.message}`);
      }
    }

    const m = this.companyMembers.get(memberId);
    if (!m || m.companyId !== companyId) return null;
    m.status = status;
    m.updatedAt = new Date();
    this.companyMembers.set(memberId, m);
    return m;
  }

  // --- AUDIT LOGS ---
  async recordAudit(data: Omit<AuditLogEntity, 'id' | 'createdAt'>): Promise<AuditLogEntity> {
    const id = randomUUID();
    const now = new Date();

    if (this.supabase) {
      try {
        await this.supabase.from('audit_logs').insert({
          id,
          company_id: data.companyId,
          user_id: data.userId || null,
          action: data.action,
          entity: data.entity,
          entity_id: data.entityId || null,
          old_value: data.oldValue || null,
          new_value: data.newValue || null,
          ip_address: data.ipAddress || null,
          user_agent: data.userAgent || null,
        });
      } catch (err: any) {
        this.logger.warn(`Failed to insert audit log into Supabase: ${err.message}`);
      }
    }

    const log: AuditLogEntity = {
      ...data,
      id,
      createdAt: now,
    };
    this.auditLogs.push(log);
    this.logger.log(`[AUDIT] Company:${data.companyId} | Action:${data.action} | Entity:${data.entity}`);
    return log;
  }

  async getAuditLogs(companyId: string, limit = 50): Promise<AuditLogEntity[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('audit_logs')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data) {
          return data.map((row) => this.mapAuditLog(row));
        }
      } catch (err: any) {
        this.logger.error(`Supabase getAuditLogs exception: ${err.message}`);
      }
    }

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

    if (this.supabase) {
      try {
        let query = this.supabase
          .from('employees')
          .select('*', { count: 'exact' })
          .eq('company_id', companyId);

        if (status) {
          query = query.eq('employment_status', status);
        }

        if (search) {
          query = query.or(
            `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_number.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
          );
        }

        const startIndex = (page - 1) * limit;
        query = query.range(startIndex, startIndex + limit - 1);

        const { data, error, count } = await query;
        if (!error && data) {
          const total = count ?? data.length;
          const totalPages = Math.ceil(total / limit) || 1;
          const items = data.map((r) => this.mapEmployee(r));
          return { items, total, page, totalPages };
        }
      } catch (err: any) {
        this.logger.error(`Supabase findEmployees exception: ${err.message}`);
      }
    }

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
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('employees')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return this.mapEmployee(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findEmployeeById exception: ${err.message}`);
      }
    }

    const emp = this.employees.get(id);
    if (!emp || emp.companyId !== companyId) {
      return null;
    }
    return emp;
  }

  async findEmployeeByNumber(companyId: string, employeeNumber: string): Promise<EmployeeEntity | null> {
    const normalized = employeeNumber.toUpperCase().trim();

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('employees')
          .select('*')
          .eq('company_id', companyId)
          .eq('employee_number', normalized)
          .maybeSingle();

        if (!error && data) {
          return this.mapEmployee(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findEmployeeByNumber exception: ${err.message}`);
      }
    }

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
    const normalizedNumber = data.employeeNumber.toUpperCase().trim();

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('employees')
          .insert({
            id,
            company_id: data.companyId,
            user_id: data.userId || null,
            employee_number: normalizedNumber,
            first_name: data.firstName.trim(),
            last_name: data.lastName.trim(),
            email: data.email.toLowerCase().trim(),
            phone: data.phone.trim(),
            date_of_birth: data.dateOfBirth,
            address: data.address,
            emergency_contact: data.emergencyContact,
            employment_status: data.employmentStatus,
            account_status: data.accountStatus || 'invited',
            employment_start_date: data.employmentStartDate,
            employment_end_date: data.employmentEndDate || null,
          })
          .select()
          .single();

        if (!error && inserted) {
          const emp = this.mapEmployee(inserted);
          this.employees.set(emp.id, emp);
          return emp;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createEmployee exception: ${err.message}`);
      }
    }

    const employee: EmployeeEntity = {
      ...data,
      id,
      employeeNumber: normalizedNumber,
      accountStatus: data.accountStatus || 'invited',
      createdAt: now,
      updatedAt: now,
    };
    this.employees.set(id, employee);
    return employee;
  }

  async findEmployeeByUserId(companyId: string, userId: string): Promise<EmployeeEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('employees')
          .select('*')
          .eq('company_id', companyId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!error && data) {
          return this.mapEmployee(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findEmployeeByUserId exception: ${err.message}`);
      }
    }

    for (const emp of this.employees.values()) {
      if (emp.companyId === companyId && emp.userId === userId) {
        return emp;
      }
    }
    return null;
  }

  async updateEmployee(
    companyId: string,
    id: string,
    updates: Partial<Omit<EmployeeEntity, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>
  ): Promise<EmployeeEntity | null> {
    if (this.supabase) {
      try {
        const dbUpdates: any = { updated_at: new Date().toISOString() };
        if (updates.firstName) dbUpdates.first_name = updates.firstName;
        if (updates.lastName) dbUpdates.last_name = updates.lastName;
        if (updates.email) dbUpdates.email = updates.email.toLowerCase().trim();
        if (updates.phone) dbUpdates.phone = updates.phone;
        if (updates.employmentStatus) dbUpdates.employment_status = updates.employmentStatus;
        if (updates.accountStatus) dbUpdates.account_status = updates.accountStatus;
        if (updates.userId !== undefined) dbUpdates.user_id = updates.userId;
        if (updates.address) dbUpdates.address = updates.address;
        if (updates.emergencyContact) dbUpdates.emergency_contact = updates.emergencyContact;

        const { data, error } = await this.supabase
          .from('employees')
          .update(dbUpdates)
          .eq('company_id', companyId)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (!error && data) {
          const emp = this.mapEmployee(data);
          this.employees.set(emp.id, emp);
          return emp;
        }
      } catch (err: any) {
        this.logger.error(`Supabase updateEmployee exception: ${err.message}`);
      }
    }

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

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('employee_licences')
          .insert({
            id,
            company_id: data.companyId,
            employee_id: data.employeeId,
            licence_type: data.licenceType,
            licence_number: data.licenceNumber,
            expiry_date: data.expiryDate,
            status: data.status,
            verified_at: data.verifiedAt?.toISOString() || null,
            verified_by: data.verifiedBy || null,
          })
          .select()
          .single();

        if (!error && inserted) {
          const lic = this.mapLicence(inserted);
          this.licences.set(lic.id, lic);
          return lic;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createLicence exception: ${err.message}`);
      }
    }

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
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('employee_licences')
          .select('*')
          .eq('company_id', companyId)
          .eq('employee_id', employeeId);

        if (!error && data) {
          return data.map((r) => this.mapLicence(r));
        }
      } catch (err: any) {
        this.logger.error(`Supabase findLicencesByEmployeeId exception: ${err.message}`);
      }
    }

    const results: LicenceEntity[] = [];
    for (const lic of this.licences.values()) {
      if (lic.companyId === companyId && lic.employeeId === employeeId) {
        results.push(lic);
      }
    }
    return results;
  }

  async findLicences(
    companyId: string,
    options: {
      status?: LicenceStatus | 'all';
      employeeId?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ items: Array<LicenceEntity & { employee?: EmployeeEntity }>; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const search = options.search?.toLowerCase().trim();
    const status = options.status && options.status !== 'all' ? options.status : null;

    if (this.supabase) {
      try {
        let query = this.supabase
          .from('employee_licences')
          .select('*, employees(*)', { count: 'exact' })
          .eq('company_id', companyId);

        if (status) {
          query = query.eq('status', status);
        }

        if (options.employeeId) {
          query = query.eq('employee_id', options.employeeId);
        }

        const startIndex = (page - 1) * limit;
        query = query.order('expiry_date', { ascending: true }).range(startIndex, startIndex + limit - 1);

        const { data, error, count } = await query;
        if (!error && data) {
          const total = count ?? data.length;
          const totalPages = Math.ceil(total / limit) || 1;
          const items = data.map((r) => {
            const lic = this.mapLicence(r);
            const emp = r.employees ? this.mapEmployee(r.employees) : undefined;
            return { ...lic, employee: emp };
          });
          return { items, total, page, totalPages };
        }
      } catch (err: any) {
        this.logger.error(`Supabase findLicences exception: ${err.message}`);
      }
    }

    let filtered = Array.from(this.licences.values()).filter((l) => l.companyId === companyId);

    if (status) {
      filtered = filtered.filter((l) => l.status === status);
    }
    if (options.employeeId) {
      filtered = filtered.filter((l) => l.employeeId === options.employeeId);
    }
    if (search) {
      filtered = filtered.filter((l) => {
        const emp = this.employees.get(l.employeeId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}`.toLowerCase() : '';
        return (
          l.licenceNumber.toLowerCase().includes(search) ||
          l.licenceType.toLowerCase().includes(search) ||
          empName.includes(search)
        );
      });
    }

    filtered.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const items = filtered.slice(startIndex, startIndex + limit).map((l) => ({
      ...l,
      employee: this.employees.get(l.employeeId),
    }));

    return { items, total, page, totalPages };
  }

  async findLicenceById(companyId: string, id: string): Promise<LicenceEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('employee_licences')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return this.mapLicence(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findLicenceById exception: ${err.message}`);
      }
    }

    const lic = this.licences.get(id);
    if (!lic || lic.companyId !== companyId) return null;
    return lic;
  }

  async updateLicence(
    companyId: string,
    id: string,
    data: Partial<LicenceEntity>
  ): Promise<LicenceEntity> {
    const existing = await this.findLicenceById(companyId, id);
    if (!existing) {
      throw new Error(`Licence '${id}' not found`);
    }

    const now = new Date();
    const updated: LicenceEntity = {
      ...existing,
      ...data,
      updatedAt: now,
    };

    if (this.supabase) {
      try {
        const updatePayload: Record<string, any> = { updated_at: now.toISOString() };
        if (data.licenceType !== undefined) updatePayload.licence_type = data.licenceType;
        if (data.licenceNumber !== undefined) updatePayload.licence_number = data.licenceNumber;
        if (data.expiryDate !== undefined) updatePayload.expiry_date = data.expiryDate;
        if (data.status !== undefined) updatePayload.status = data.status;
        if (data.verifiedAt !== undefined) updatePayload.verified_at = data.verifiedAt?.toISOString() || null;
        if (data.verifiedBy !== undefined) updatePayload.verified_by = data.verifiedBy || null;

        await this.supabase
          .from('employee_licences')
          .update(updatePayload)
          .eq('company_id', companyId)
          .eq('id', id);
      } catch (err: any) {
        this.logger.error(`Supabase updateLicence exception: ${err.message}`);
      }
    }

    this.licences.set(id, updated);
    return updated;
  }

  async verifyLicence(
    companyId: string,
    id: string,
    verifiedBy: string,
    status: LicenceStatus
  ): Promise<LicenceEntity> {
    return this.updateLicence(companyId, id, {
      status,
      verifiedBy,
      verifiedAt: new Date(),
    });
  }

  async deleteLicence(companyId: string, id: string): Promise<boolean> {
    if (this.supabase) {
      try {
        await this.supabase
          .from('employee_licences')
          .delete()
          .eq('company_id', companyId)
          .eq('id', id);
      } catch (err: any) {
        this.logger.error(`Supabase deleteLicence exception: ${err.message}`);
      }
    }

    const existed = this.licences.has(id);
    this.licences.delete(id);
    return existed;
  }

  async getLicenceComplianceSummary(companyId: string): Promise<{
    total: number;
    valid: number;
    expiringSoon: number;
    expired: number;
    pendingVerification: number;
    rejected: number;
  }> {
    let licences: LicenceEntity[] = [];

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('employee_licences')
          .select('*')
          .eq('company_id', companyId);

        if (!error && data) {
          licences = data.map((r) => this.mapLicence(r));
        }
      } catch (err: any) {
        this.logger.error(`Supabase getLicenceComplianceSummary exception: ${err.message}`);
      }
    }

    if (licences.length === 0) {
      licences = Array.from(this.licences.values()).filter((l) => l.companyId === companyId);
    }

    const now = new Date();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    let valid = 0;
    let expiringSoon = 0;
    let expired = 0;
    let pendingVerification = 0;
    let rejected = 0;

    for (const lic of licences) {
      const expiry = new Date(lic.expiryDate);
      if (lic.status === 'rejected') {
        rejected++;
      } else if (lic.status === 'pending_verification') {
        pendingVerification++;
      } else if (expiry.getTime() < now.getTime() || lic.status === 'expired') {
        expired++;
      } else if (expiry.getTime() - now.getTime() <= thirtyDays || lic.status === 'expiring_soon') {
        expiringSoon++;
      } else {
        valid++;
      }
    }

    return {
      total: licences.length,
      valid,
      expiringSoon,
      expired,
      pendingVerification,
      rejected,
    };
  }

  // --- DOCUMENT OPERATIONS (SECTION 30, 42) ---
  async createDocument(
    data: Omit<DocumentEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<DocumentEntity> {
    const id = randomUUID();
    const now = new Date();

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('documents')
          .insert({
            id,
            company_id: data.companyId,
            employee_id: data.employeeId,
            document_type: data.documentType,
            file_name: data.fileName,
            storage_path: data.storagePath,
            mime_type: data.mimeType,
            file_size_bytes: data.fileSizeBytes,
            is_verified: data.isVerified,
            verified_at: data.verifiedAt?.toISOString() || null,
            verified_by: data.verifiedBy || null,
          })
          .select()
          .single();

        if (!error && inserted) {
          const doc = this.mapDocument(inserted);
          this.documents.set(doc.id, doc);
          return doc;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createDocument exception: ${err.message}`);
      }
    }

    const doc: DocumentEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(id, doc);
    return doc;
  }

  async findDocumentsByEmployeeId(
    companyId: string,
    employeeId: string
  ): Promise<DocumentEntity[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('documents')
          .select('*')
          .eq('company_id', companyId)
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data.map((r) => this.mapDocument(r));
        }
      } catch (err: any) {
        this.logger.error(`Supabase findDocumentsByEmployeeId exception: ${err.message}`);
      }
    }

    const results: DocumentEntity[] = [];
    for (const doc of this.documents.values()) {
      if (doc.companyId === companyId && doc.employeeId === employeeId) {
        results.push(doc);
      }
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findDocumentById(companyId: string, id: string): Promise<DocumentEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('documents')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return this.mapDocument(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findDocumentById exception: ${err.message}`);
      }
    }

    const doc = this.documents.get(id);
    if (!doc || doc.companyId !== companyId) return null;
    return doc;
  }

  async verifyDocument(
    companyId: string,
    id: string,
    verifiedBy: string,
    isVerified: boolean
  ): Promise<DocumentEntity> {
    const existing = await this.findDocumentById(companyId, id);
    if (!existing) {
      throw new Error(`Document '${id}' not found`);
    }

    const now = new Date();
    const updated: DocumentEntity = {
      ...existing,
      isVerified,
      verifiedBy: isVerified ? verifiedBy : undefined,
      verifiedAt: isVerified ? now : undefined,
      updatedAt: now,
    };

    if (this.supabase) {
      try {
        await this.supabase
          .from('documents')
          .update({
            is_verified: isVerified,
            verified_by: isVerified ? verifiedBy : null,
            verified_at: isVerified ? now.toISOString() : null,
            updated_at: now.toISOString(),
          })
          .eq('company_id', companyId)
          .eq('id', id);
      } catch (err: any) {
        this.logger.error(`Supabase verifyDocument exception: ${err.message}`);
      }
    }

    this.documents.set(id, updated);
    return updated;
  }

  async deleteDocument(companyId: string, id: string): Promise<boolean> {
    if (this.supabase) {
      try {
        await this.supabase
          .from('documents')
          .delete()
          .eq('company_id', companyId)
          .eq('id', id);
      } catch (err: any) {
        this.logger.error(`Supabase deleteDocument exception: ${err.message}`);
      }
    }

    const existed = this.documents.has(id);
    this.documents.delete(id);
    return existed;
  }

  // --- SITE OPERATIONS (SECTION 17, 21) ---
  async findSites(companyId: string): Promise<SiteEntity[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('sites')
          .select('*')
          .eq('company_id', companyId)
          .order('name');

        if (!error && data) {
          return data.map((r) => this.mapSite(r));
        }
      } catch (err: any) {
        this.logger.error(`Supabase findSites exception: ${err.message}`);
      }
    }

    return Array.from(this.sites.values())
      .filter((s) => s.companyId === companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findSiteById(companyId: string, id: string): Promise<SiteEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('sites')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return this.mapSite(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findSiteById exception: ${err.message}`);
      }
    }

    const site = this.sites.get(id);
    if (!site || site.companyId !== companyId) return null;
    return site;
  }

  async findSiteByCode(companyId: string, code: string): Promise<SiteEntity | null> {
    const normalized = code.toUpperCase().trim();

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('sites')
          .select('*')
          .eq('company_id', companyId)
          .eq('code', normalized)
          .maybeSingle();

        if (!error && data) {
          return this.mapSite(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findSiteByCode exception: ${err.message}`);
      }
    }

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
    const code = data.code.toUpperCase().trim();

    if (this.supabase) {
      try {
        const enrichedAddress = {
          ...(data.address || {}),
          latitude: data.latitude || undefined,
          longitude: data.longitude || undefined,
          geofenceRadius: data.geofenceRadius || 200,
        };

        const { data: inserted, error } = await this.supabase
          .from('sites')
          .insert({
            id,
            company_id: data.companyId,
            name: data.name.trim(),
            code,
            address: enrichedAddress,
            contact_name: data.contactName || null,
            contact_phone: data.contactPhone || null,
            contact_email: data.contactEmail || null,
            status: data.status || 'active',
          })
          .select()
          .single();

        if (!error && inserted) {
          const site = this.mapSite(inserted);
          this.sites.set(site.id, site);
          return site;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createSite exception: ${err.message}`);
      }
    }

    const site: SiteEntity = {
      ...data,
      id,
      code,
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
    if (this.supabase) {
      try {
        const dbUpdates: any = { updated_at: new Date().toISOString() };
        if (updates.name) dbUpdates.name = updates.name.trim();
        if (updates.status) dbUpdates.status = updates.status;
        if (updates.contactName) dbUpdates.contact_name = updates.contactName;
        if (updates.contactPhone) dbUpdates.contact_phone = updates.contactPhone;

        const { data, error } = await this.supabase
          .from('sites')
          .update(dbUpdates)
          .eq('company_id', companyId)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (!error && data) {
          const site = this.mapSite(data);
          this.sites.set(site.id, site);
          return site;
        }
      } catch (err: any) {
        this.logger.error(`Supabase updateSite exception: ${err.message}`);
      }
    }

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
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('job_types')
          .select('*')
          .eq('company_id', companyId)
          .order('name');

        if (!error && data) {
          return data.map((r) => this.mapJobType(r));
        }
      } catch (err: any) {
        this.logger.error(`Supabase findJobTypes exception: ${err.message}`);
      }
    }

    return Array.from(this.jobTypes.values())
      .filter((j) => j.companyId === companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findJobTypeById(companyId: string, id: string): Promise<JobTypeEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('job_types')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return this.mapJobType(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findJobTypeById exception: ${err.message}`);
      }
    }

    const job = this.jobTypes.get(id);
    if (!job || job.companyId !== companyId) return null;
    return job;
  }

  async findJobTypeByName(companyId: string, name: string): Promise<JobTypeEntity | null> {
    const normalized = name.toLowerCase().trim();

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('job_types')
          .select('*')
          .eq('company_id', companyId)
          .ilike('name', normalized)
          .maybeSingle();

        if (!error && data) {
          return this.mapJobType(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findJobTypeByName exception: ${err.message}`);
      }
    }

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

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('job_types')
          .insert({
            id,
            company_id: data.companyId,
            name: data.name.trim(),
            description: data.description || null,
            is_active: data.isActive ?? true,
          })
          .select()
          .single();

        if (!error && inserted) {
          const job = this.mapJobType(inserted);
          this.jobTypes.set(job.id, job);
          return job;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createJobType exception: ${err.message}`);
      }
    }

    const job: JobTypeEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.jobTypes.set(id, job);
    return job;
  }

  async updateJobType(
    companyId: string,
    id: string,
    updates: Partial<Omit<JobTypeEntity, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>
  ): Promise<JobTypeEntity | null> {
    if (this.supabase) {
      try {
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        if (updates.name !== undefined) patch.name = updates.name.trim();
        if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
        if (updates.isActive !== undefined) patch.is_active = updates.isActive;

        const { data, error } = await this.supabase
          .from('job_types')
          .update(patch)
          .eq('company_id', companyId)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (!error && data) {
          const jt = this.mapJobType(data);
          this.jobTypes.set(jt.id, jt);
          return jt;
        }
      } catch (err: any) {
        this.logger.error(`Supabase updateJobType exception: ${err.message}`);
      }
    }

    const jt = await this.findJobTypeById(companyId, id);
    if (!jt) return null;

    const updated: JobTypeEntity = {
      ...jt,
      ...updates,
      updatedAt: new Date(),
    };
    this.jobTypes.set(id, updated);
    return updated;
  }

  async deleteJobType(companyId: string, id: string): Promise<boolean> {
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('job_types')
          .delete()
          .eq('company_id', companyId)
          .eq('id', id);

        if (!error) {
          this.jobTypes.delete(id);
          return true;
        }
      } catch (err: any) {
        this.logger.error(`Supabase deleteJobType exception: ${err.message}`);
      }
    }

    const jt = this.jobTypes.get(id);
    if (jt && jt.companyId === companyId) {
      this.jobTypes.delete(id);
      return true;
    }
    return false;
  }

  // --- SITE JOBS & RATES (SECTION 21) ---
  async findSiteJobs(
    companyId: string,
    siteId: string
  ): Promise<Array<SiteJobEntity & { jobType: JobTypeEntity }>> {
    const results: Array<SiteJobEntity & { jobType: JobTypeEntity }> = [];

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('site_jobs')
          .select('*, job_types(*)')
          .eq('company_id', companyId)
          .eq('site_id', siteId);

        if (!error && data) {
          for (const row of data) {
            const sj = this.mapSiteJob(row);
            if (row.job_types) {
              const jt = this.mapJobType(row.job_types);
              results.push({ ...sj, jobType: jt });
            }
          }
          return results;
        }
      } catch (err: any) {
        this.logger.error(`Supabase findSiteJobs exception: ${err.message}`);
      }
    }

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
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('site_jobs')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return this.mapSiteJob(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findSiteJobById exception: ${err.message}`);
      }
    }

    const sj = this.siteJobs.get(id);
    if (!sj || sj.companyId !== companyId) return null;
    return sj;
  }

  async findSiteJobByPair(
    companyId: string,
    siteId: string,
    jobTypeId: string
  ): Promise<SiteJobEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('site_jobs')
          .select('*')
          .eq('company_id', companyId)
          .eq('site_id', siteId)
          .eq('job_type_id', jobTypeId)
          .maybeSingle();

        if (!error && data) {
          return this.mapSiteJob(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findSiteJobByPair exception: ${err.message}`);
      }
    }

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

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('site_jobs')
          .insert({
            id,
            company_id: data.companyId,
            site_id: data.siteId,
            job_type_id: data.jobTypeId,
            default_pay_rate: data.defaultPayRate,
            billing_rate: data.billingRate,
            currency: data.currency || 'GBP',
            status: data.status || 'active',
          })
          .select()
          .single();

        if (!error && inserted) {
          const sj = this.mapSiteJob(inserted);
          this.siteJobs.set(sj.id, sj);
          return sj;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createSiteJob exception: ${err.message}`);
      }
    }

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
    if (this.supabase) {
      try {
        const dbUpdates: any = { updated_at: new Date().toISOString() };
        if (updates.defaultPayRate !== undefined) dbUpdates.default_pay_rate = updates.defaultPayRate;
        if (updates.billingRate !== undefined) dbUpdates.billing_rate = updates.billingRate;
        if (updates.status) dbUpdates.status = updates.status;

        const { data, error } = await this.supabase
          .from('site_jobs')
          .update(dbUpdates)
          .eq('company_id', companyId)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (!error && data) {
          const sj = this.mapSiteJob(data);
          this.siteJobs.set(sj.id, sj);
          return sj;
        }
      } catch (err: any) {
        this.logger.error(`Supabase updateSiteJob exception: ${err.message}`);
      }
    }

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

  async findAllSiteJobs(
    companyId: string
  ): Promise<Array<SiteJobEntity & { site?: SiteEntity; jobType: JobTypeEntity }>> {
    const results: Array<SiteJobEntity & { site?: SiteEntity; jobType: JobTypeEntity }> = [];

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('site_jobs')
          .select('*, sites(*), job_types(*)')
          .eq('company_id', companyId);

        if (!error && data) {
          for (const row of data) {
            const sj = this.mapSiteJob(row);
            const jt = row.job_types ? this.mapJobType(row.job_types) : null;
            const site = row.sites ? this.mapSite(row.sites) : null;
            if (jt) {
              results.push({ ...sj, jobType: jt, site: site || undefined });
            }
          }
          return results;
        }
      } catch (err: any) {
        this.logger.error(`Supabase findAllSiteJobs exception: ${err.message}`);
      }
    }

    for (const sj of this.siteJobs.values()) {
      if (sj.companyId === companyId) {
        const jobType = await this.findJobTypeById(companyId, sj.jobTypeId);
        const site = await this.findSiteById(companyId, sj.siteId);
        if (jobType) {
          results.push({ ...sj, jobType, site: site || undefined });
        }
      }
    }
    return results;
  }

  async deleteSiteJob(companyId: string, siteId: string, id: string): Promise<boolean> {
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('site_jobs')
          .delete()
          .eq('company_id', companyId)
          .eq('site_id', siteId)
          .eq('id', id);

        if (!error) {
          this.siteJobs.delete(id);
          return true;
        }
      } catch (err: any) {
        this.logger.error(`Supabase deleteSiteJob exception: ${err.message}`);
      }
    }

    const sj = this.siteJobs.get(id);
    if (sj && sj.companyId === companyId && sj.siteId === siteId) {
      this.siteJobs.delete(id);
      return true;
    }
    return false;
  }

  // --- ASSIGNMENT OPERATIONS (SECTION 22, 37, 38) ---
  async createAssignment(
    data: Omit<AssignmentEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AssignmentEntity> {
    const id = randomUUID();
    const now = new Date();

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('assignments')
          .insert({
            id,
            company_id: data.companyId,
            employee_id: data.employeeId,
            site_job_id: data.siteJobId,
            pay_rate: data.payRate,
            start_date: data.startDate,
            end_date: data.endDate || null,
            status: data.status || 'active',
          })
          .select()
          .single();

        if (!error && inserted) {
          const a = this.mapAssignment(inserted);
          this.assignments.set(a.id, a);
          return a;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createAssignment exception: ${err.message}`);
      }
    }

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
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('assignments')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return this.mapAssignment(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findAssignmentById exception: ${err.message}`);
      }
    }

    const assignment = this.assignments.get(id);
    if (!assignment || assignment.companyId !== companyId) return null;
    return assignment;
  }

  async findAssignmentsByEmployeeId(
    companyId: string,
    employeeId: string
  ): Promise<Array<AssignmentEntity & { siteJob: SiteJobEntity & { site: SiteEntity; jobType: JobTypeEntity } }>> {
    const results: Array<AssignmentEntity & { siteJob: SiteJobEntity & { site: SiteEntity; jobType: JobTypeEntity } }> = [];

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('assignments')
          .select('*, site_jobs(*, sites(*), job_types(*))')
          .eq('company_id', companyId)
          .eq('employee_id', employeeId);

        if (!error && data) {
          for (const row of data) {
            const assignment = this.mapAssignment(row);
            if (row.site_jobs && row.site_jobs.sites && row.site_jobs.job_types) {
              const sj = this.mapSiteJob(row.site_jobs);
              const site = this.mapSite(row.site_jobs.sites);
              const jt = this.mapJobType(row.site_jobs.job_types);
              results.push({
                ...assignment,
                siteJob: { ...sj, site, jobType: jt },
              });
            }
          }
          return results.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        }
      } catch (err: any) {
        this.logger.error(`Supabase findAssignmentsByEmployeeId exception: ${err.message}`);
      }
    }

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

  async findCompanyAssignments(
    companyId: string,
    options?: { siteId?: string; status?: string }
  ): Promise<Array<AssignmentEntity & {
    employee?: EmployeeEntity;
    siteJob: SiteJobEntity & { site: SiteEntity; jobType: JobTypeEntity };
  }>> {
    const results: Array<AssignmentEntity & {
      employee?: EmployeeEntity;
      siteJob: SiteJobEntity & { site: SiteEntity; jobType: JobTypeEntity };
    }> = [];

    if (this.supabase) {
      try {
        let query = this.supabase
          .from('assignments')
          .select('*, employees(*), site_jobs(*, sites(*), job_types(*))')
          .eq('company_id', companyId);

        if (options?.status && options.status !== 'all') {
          query = query.eq('status', options.status);
        }

        const { data, error } = await query;
        if (!error && data) {
          for (const row of data) {
            const assignment = this.mapAssignment(row);
            const employee = row.employees ? this.mapEmployee(row.employees) : undefined;
            if (row.site_jobs && row.site_jobs.sites && row.site_jobs.job_types) {
              const sj = this.mapSiteJob(row.site_jobs);
              const site = this.mapSite(row.site_jobs.sites);
              const jt = this.mapJobType(row.site_jobs.job_types);
              if (!options?.siteId || options.siteId === site.id) {
                results.push({
                  ...assignment,
                  employee,
                  siteJob: { ...sj, site, jobType: jt },
                });
              }
            }
          }
          return results.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        }
      } catch (err: any) {
        this.logger.error(`Supabase findCompanyAssignments exception: ${err.message}`);
      }
    }

    for (const a of this.assignments.values()) {
      if (a.companyId === companyId) {
        if (options?.status && options.status !== 'all' && a.status !== options.status) {
          continue;
        }
        const siteJob = await this.findSiteJobById(companyId, a.siteJobId);
        if (siteJob) {
          if (options?.siteId && siteJob.siteId !== options.siteId) {
            continue;
          }
          const site = await this.findSiteById(companyId, siteJob.siteId);
          const jobType = await this.findJobTypeById(companyId, siteJob.jobTypeId);
          const employee = await this.findEmployeeById(companyId, a.employeeId);
          if (site && jobType) {
            results.push({
              ...a,
              employee: employee || undefined,
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
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('assignments')
          .update({
            end_date: endDate,
            status,
            updated_at: new Date().toISOString(),
          })
          .eq('company_id', companyId)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (!error && data) {
          const a = this.mapAssignment(data);
          this.assignments.set(a.id, a);
          return a;
        }
      } catch (err: any) {
        this.logger.error(`Supabase closeAssignment exception: ${err.message}`);
      }
    }

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

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('shifts')
          .insert({
            id,
            company_id: data.companyId,
            site_id: data.siteId,
            site_job_id: data.siteJobId,
            employee_id: data.employeeId || null,
            shift_date: data.shiftDate,
            start_time: data.startTime,
            end_time: data.endTime,
            break_minutes: data.breakMinutes || 0,
            status: data.status || 'scheduled',
            notes: data.notes || null,
          })
          .select()
          .single();

        if (!error && inserted) {
          const shift = this.mapShift(inserted);
          this.shifts.set(shift.id, shift);
          return shift;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createShift exception: ${err.message}`);
      }
    }

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
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('shifts')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return this.mapShift(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findShiftById exception: ${err.message}`);
      }
    }

    const shift = this.shifts.get(id);
    if (!shift || shift.companyId !== companyId) return null;
    return shift;
  }

  async updateShift(
    companyId: string,
    id: string,
    updates: Partial<Omit<ShiftEntity, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ShiftEntity | null> {
    if (this.supabase) {
      try {
        const dbUpdates: any = { updated_at: new Date().toISOString() };
        if (updates.employeeId !== undefined) dbUpdates.employee_id = updates.employeeId;
        if (updates.shiftDate) dbUpdates.shift_date = updates.shiftDate;
        if (updates.startTime) dbUpdates.start_time = updates.startTime;
        if (updates.endTime) dbUpdates.end_time = updates.endTime;
        if (updates.breakMinutes !== undefined) dbUpdates.break_minutes = updates.breakMinutes;
        if (updates.status) dbUpdates.status = updates.status;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

        const { data, error } = await this.supabase
          .from('shifts')
          .update(dbUpdates)
          .eq('company_id', companyId)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (!error && data) {
          const shift = this.mapShift(data);
          this.shifts.set(shift.id, shift);
          return shift;
        }
      } catch (err: any) {
        this.logger.error(`Supabase updateShift exception: ${err.message}`);
      }
    }

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
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('shifts')
          .delete()
          .eq('company_id', companyId)
          .eq('id', id);

        if (!error) {
          this.shifts.delete(id);
          return true;
        }
      } catch (err: any) {
        this.logger.error(`Supabase deleteShift exception: ${err.message}`);
      }
    }

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

    if (this.supabase) {
      try {
        let query = this.supabase
          .from('shifts')
          .select('*, sites(*), site_jobs(*, job_types(*)), employees(*)')
          .eq('company_id', companyId);

        if (filters.siteId && filters.siteId !== 'all') {
          query = query.eq('site_id', filters.siteId);
        }
        if (filters.employeeId) {
          query = query.eq('employee_id', filters.employeeId);
        }
        if (filters.status && filters.status !== 'all') {
          query = query.eq('status', filters.status);
        }
        if (filters.startDate) {
          query = query.gte('shift_date', filters.startDate);
        }
        if (filters.endDate) {
          query = query.lte('shift_date', filters.endDate);
        }

        const { data, error } = await query;
        if (!error && data) {
          for (const row of data) {
            const shift = this.mapShift(row);
            if (row.sites && row.site_jobs && row.site_jobs.job_types) {
              const site = this.mapSite(row.sites);
              const sj = this.mapSiteJob(row.site_jobs);
              const jt = this.mapJobType(row.site_jobs.job_types);
              let employee: EmployeeEntity | undefined = undefined;
              if (row.employees) {
                employee = this.mapEmployee(row.employees);
              }
              results.push({
                ...shift,
                site,
                siteJob: { ...sj, jobType: jt },
                employee,
              });
            }
          }
          return results.sort((a, b) => {
            if (a.shiftDate !== b.shiftDate) {
              return a.shiftDate.localeCompare(b.shiftDate);
            }
            return a.startTime.localeCompare(b.startTime);
          });
        }
      } catch (err: any) {
        this.logger.error(`Supabase findShifts exception: ${err.message}`);
      }
    }

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
    const list = await this.findShifts(companyId, { employeeId, startDate: shiftDate, endDate: shiftDate });
    const conflicts: ShiftEntity[] = [];

    for (const s of list) {
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

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('attendance_records')
          .insert({
            id,
            company_id: data.companyId,
            shift_id: data.shiftId || null,
            employee_id: data.employeeId,
            site_id: data.siteId,
            clock_in_time: data.clockInTime.toISOString(),
            clock_out_time: data.clockOutTime ? data.clockOutTime.toISOString() : null,
            clock_in_lat: data.clockInLat || null,
            clock_in_lng: data.clockInLng || null,
            clock_in_accuracy: data.clockInAccuracy || null,
            clock_in_distance: data.clockInDistance || null,
            clock_in_verified: data.clockInVerified,
            clock_out_lat: data.clockOutLat || null,
            clock_out_lng: data.clockOutLng || null,
            clock_out_accuracy: data.clockOutAccuracy || null,
            clock_out_distance: data.clockOutDistance || null,
            clock_out_verified: data.clockOutVerified,
            break_start_time: data.breakStartTime ? data.breakStartTime.toISOString() : null,
            break_end_time: data.breakEndTime ? data.breakEndTime.toISOString() : null,
            break_minutes: data.breakMinutes || 0,
            total_hours: data.totalHours || 0,
            status: data.status || 'clocked_in',
            variance_flag: data.varianceFlag || 'none',
            supervisor_notes: data.supervisorNotes || null,
            reconciled_by: data.reconciledBy || null,
            reconciled_at: data.reconciledAt ? data.reconciledAt.toISOString() : null,
          })
          .select()
          .single();

        if (!error && inserted) {
          const record = this.mapAttendance(inserted);
          this.attendanceRecords.set(record.id, record);
          return record;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createAttendanceRecord exception: ${err.message}`);
      }
    }

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
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('attendance_records')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return this.mapAttendance(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findAttendanceById exception: ${err.message}`);
      }
    }

    const record = this.attendanceRecords.get(id);
    if (!record || record.companyId !== companyId) return null;
    return record;
  }

  async updateAttendanceRecord(
    companyId: string,
    id: string,
    updates: Partial<Omit<AttendanceEntity, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>
  ): Promise<AttendanceEntity | null> {
    if (this.supabase) {
      try {
        const dbUpdates: any = { updated_at: new Date().toISOString() };
        if (updates.clockOutTime) dbUpdates.clock_out_time = updates.clockOutTime.toISOString();
        if (updates.clockOutLat !== undefined) dbUpdates.clock_out_lat = updates.clockOutLat;
        if (updates.clockOutLng !== undefined) dbUpdates.clock_out_lng = updates.clockOutLng;
        if (updates.clockOutAccuracy !== undefined) dbUpdates.clock_out_accuracy = updates.clockOutAccuracy;
        if (updates.clockOutDistance !== undefined) dbUpdates.clock_out_distance = updates.clockOutDistance;
        if (updates.clockOutVerified !== undefined) dbUpdates.clock_out_verified = updates.clockOutVerified;
        if (updates.breakStartTime) dbUpdates.break_start_time = updates.breakStartTime.toISOString();
        if (updates.breakEndTime) dbUpdates.break_end_time = updates.breakEndTime.toISOString();
        if (updates.breakMinutes !== undefined) dbUpdates.break_minutes = updates.breakMinutes;
        if (updates.totalHours !== undefined) dbUpdates.total_hours = updates.totalHours;
        if (updates.status) dbUpdates.status = updates.status;
        if (updates.varianceFlag) dbUpdates.variance_flag = updates.varianceFlag;
        if (updates.supervisorNotes !== undefined) dbUpdates.supervisor_notes = updates.supervisorNotes;
        if (updates.reconciledBy) dbUpdates.reconciled_by = updates.reconciledBy;
        if (updates.reconciledAt) dbUpdates.reconciled_at = updates.reconciledAt.toISOString();

        const { data, error } = await this.supabase
          .from('attendance_records')
          .update(dbUpdates)
          .eq('company_id', companyId)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (!error && data) {
          const record = this.mapAttendance(data);
          this.attendanceRecords.set(record.id, record);
          return record;
        }
      } catch (err: any) {
        this.logger.error(`Supabase updateAttendanceRecord exception: ${err.message}`);
      }
    }

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
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('attendance_records')
          .select('*')
          .eq('company_id', companyId)
          .eq('employee_id', employeeId)
          .in('status', ['clocked_in', 'on_break'])
          .order('clock_in_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          return this.mapAttendance(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findActiveAttendanceByEmployee exception: ${err.message}`);
      }
    }

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

    if (this.supabase) {
      try {
        let query = this.supabase
          .from('attendance_records')
          .select('*, employees(*), sites(*), shifts(*)')
          .eq('company_id', companyId);

        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.siteId && filters.siteId !== 'all') query = query.eq('site_id', filters.siteId);
        if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
        if (filters.varianceFlag && filters.varianceFlag !== 'all') query = query.eq('variance_flag', filters.varianceFlag);

        const { data, error } = await query;
        if (!error && data) {
          for (const row of data) {
            const record = this.mapAttendance(row);
            if (row.employees && row.sites) {
              const employee = this.mapEmployee(row.employees);
              const site = this.mapSite(row.sites);
              let shift: ShiftEntity | undefined = undefined;
              if (row.shifts) {
                shift = this.mapShift(row.shifts);
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
      } catch (err: any) {
        this.logger.error(`Supabase findAttendanceRecords exception: ${err.message}`);
      }
    }

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

  // ===========================
  // LEAVE REQUESTS
  // ===========================

  private mapLeaveRequest(row: any): LeaveRequestEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      leaveType: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
      totalDays: Number(row.total_days),
      reason: row.reason || undefined,
      status: row.status,
      reviewedBy: row.reviewed_by || undefined,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
      reviewNotes: row.review_notes || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async createLeaveRequest(
    companyId: string,
    data: Omit<LeaveRequestEntity, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>
  ): Promise<LeaveRequestEntity> {
    const id = randomUUID();
    const now = new Date();
    const entity: LeaveRequestEntity = {
      id,
      companyId,
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('leave_requests')
          .insert({
            id,
            company_id: companyId,
            employee_id: data.employeeId,
            leave_type: data.leaveType,
            start_date: data.startDate,
            end_date: data.endDate,
            total_days: data.totalDays,
            reason: data.reason || null,
            status: data.status,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .select()
          .single();
        if (!error && row) return this.mapLeaveRequest(row);
        this.logger.warn(`Supabase createLeaveRequest warn: ${error?.message}`);
      } catch (err: any) {
        this.logger.error(`Supabase createLeaveRequest exception: ${err.message}`);
      }
    }

    this.leaveRequests.set(id, entity);
    return entity;
  }

  async findLeaveRequestById(companyId: string, id: string): Promise<LeaveRequestEntity | null> {
    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('leave_requests')
          .select('*')
          .eq('id', id)
          .eq('company_id', companyId)
          .single();
        if (!error && row) return this.mapLeaveRequest(row);
      } catch (err: any) {
        this.logger.error(`Supabase findLeaveRequestById exception: ${err.message}`);
      }
    }
    const entity = this.leaveRequests.get(id);
    return entity && entity.companyId === companyId ? entity : null;
  }

  async findLeaveRequests(
    companyId: string,
    filters: { employeeId?: string; status?: string; startDate?: string; endDate?: string }
  ): Promise<(LeaveRequestEntity & { employee: EmployeeEntity })[]> {
    const results: (LeaveRequestEntity & { employee: EmployeeEntity })[] = [];

    if (this.supabase) {
      try {
        let query = this.supabase
          .from('leave_requests')
          .select('*, employees(*)')
          .eq('company_id', companyId);
        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && data) {
          for (const row of data) {
            const leave = this.mapLeaveRequest(row);
            if (row.employees) {
              results.push({ ...leave, employee: this.mapEmployee(row.employees) });
            }
          }
          return results;
        }
        this.logger.warn(`Supabase findLeaveRequests warn: ${error?.message}`);
      } catch (err: any) {
        this.logger.error(`Supabase findLeaveRequests exception: ${err.message}`);
      }
    }

    for (const leave of this.leaveRequests.values()) {
      if (leave.companyId !== companyId) continue;
      if (filters.employeeId && leave.employeeId !== filters.employeeId) continue;
      if (filters.status && filters.status !== 'all' && leave.status !== filters.status) continue;
      if (filters.startDate && leave.endDate < filters.startDate) continue;
      if (filters.endDate && leave.startDate > filters.endDate) continue;
      const employee = await this.findEmployeeById(companyId, leave.employeeId);
      if (employee) results.push({ ...leave, employee });
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateLeaveRequest(
    companyId: string,
    id: string,
    updates: Partial<Pick<LeaveRequestEntity, 'status' | 'reviewedBy' | 'reviewedAt' | 'reviewNotes'>>
  ): Promise<LeaveRequestEntity | null> {
    const existing = await this.findLeaveRequestById(companyId, id);
    if (!existing) return null;

    const now = new Date();
    const updated: LeaveRequestEntity = { ...existing, ...updates, updatedAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('leave_requests')
          .update({
            status: updates.status,
            reviewed_by: updates.reviewedBy || null,
            reviewed_at: updates.reviewedAt?.toISOString() || null,
            review_notes: updates.reviewNotes || null,
            updated_at: now.toISOString(),
          })
          .eq('id', id)
          .eq('company_id', companyId)
          .select()
          .single();
        if (!error && row) return this.mapLeaveRequest(row);
        this.logger.warn(`Supabase updateLeaveRequest warn: ${error?.message}`);
      } catch (err: any) {
        this.logger.error(`Supabase updateLeaveRequest exception: ${err.message}`);
      }
    }

    this.leaveRequests.set(id, updated);
    return updated;
  }

  async cancelLeaveRequest(companyId: string, id: string): Promise<LeaveRequestEntity | null> {
    return this.updateLeaveRequest(companyId, id, { status: 'cancelled' });
  }

  // ===========================
  // AVAILABILITY
  // ===========================

  private mapAvailability(row: any): AvailabilityEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      dayOfWeek: row.day_of_week,
      isAvailable: Boolean(row.is_available),
      preferredStartTime: row.preferred_start_time || undefined,
      preferredEndTime: row.preferred_end_time || undefined,
      notes: row.notes || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async upsertAvailability(
    companyId: string,
    employeeId: string,
    dayOfWeek: string,
    data: Pick<AvailabilityEntity, 'isAvailable' | 'preferredStartTime' | 'preferredEndTime' | 'notes'>
  ): Promise<AvailabilityEntity> {
    const existing = [...this.availabilityRecords.values()].find(
      (a) => a.companyId === companyId && a.employeeId === employeeId && a.dayOfWeek === dayOfWeek
    );

    const id = existing?.id || randomUUID();
    const now = new Date();
    const entity: AvailabilityEntity = {
      id,
      companyId,
      employeeId,
      dayOfWeek: dayOfWeek as any,
      ...data,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('employee_availability')
          .upsert(
            {
              id,
              company_id: companyId,
              employee_id: employeeId,
              day_of_week: dayOfWeek,
              is_available: data.isAvailable,
              preferred_start_time: data.preferredStartTime || null,
              preferred_end_time: data.preferredEndTime || null,
              notes: data.notes || null,
              updated_at: now.toISOString(),
            },
            { onConflict: 'company_id,employee_id,day_of_week' }
          )
          .select()
          .single();
        if (!error && row) return this.mapAvailability(row);
        this.logger.warn(`Supabase upsertAvailability warn: ${error?.message}`);
      } catch (err: any) {
        this.logger.error(`Supabase upsertAvailability exception: ${err.message}`);
      }
    }

    this.availabilityRecords.set(id, entity);
    return entity;
  }

  async findAvailabilityByEmployee(
    companyId: string,
    employeeId: string
  ): Promise<AvailabilityEntity[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('employee_availability')
          .select('*')
          .eq('company_id', companyId)
          .eq('employee_id', employeeId);
        if (!error && data) return data.map((r) => this.mapAvailability(r));
        this.logger.warn(`Supabase findAvailabilityByEmployee warn: ${error?.message}`);
      } catch (err: any) {
        this.logger.error(`Supabase findAvailabilityByEmployee exception: ${err.message}`);
      }
    }
    return [...this.availabilityRecords.values()].filter(
      (a) => a.companyId === companyId && a.employeeId === employeeId
    );
  }

  // ===========================
  // NOTIFICATIONS (PHASE 11)
  // ===========================

  private mapNotification(row: any): NotificationEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id || undefined,
      title: row.title,
      message: row.message,
      type: row.type,
      priority: row.priority || 'normal',
      status: row.status || 'unread',
      actionUrl: row.action_url || undefined,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
      emailSent: Boolean(row.email_sent),
      emailSentAt: row.email_sent_at ? new Date(row.email_sent_at) : undefined,
      readAt: row.read_at ? new Date(row.read_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async createNotification(
    data: Omit<NotificationEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<NotificationEntity> {
    const id = randomUUID();
    const now = new Date();
    const entity: NotificationEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('notifications')
          .insert({
            id,
            company_id: data.companyId,
            user_id: data.userId || null,
            title: data.title,
            message: data.message,
            type: data.type,
            priority: data.priority,
            status: data.status,
            action_url: data.actionUrl || null,
            metadata: data.metadata || {},
            email_sent: data.emailSent,
            email_sent_at: data.emailSentAt?.toISOString() || null,
            read_at: data.readAt?.toISOString() || null,
          })
          .select()
          .single();

        if (!error && row) {
          return this.mapNotification(row);
        }
        this.logger.warn(`Supabase createNotification warn: ${error?.message}`);
      } catch (err: any) {
        this.logger.error(`Supabase createNotification exception: ${err.message}`);
      }
    }

    this.notifications.set(id, entity);
    return entity;
  }

  private seedSampleNotifications(companyId: string, userId?: string) {
    const now = new Date();
    const samples: Array<Omit<NotificationEntity, 'id' | 'createdAt' | 'updatedAt'>> = [
      {
        companyId,
        userId,
        title: 'SIA Door Supervision Licence Expiring Soon',
        message: 'Security Officer David Brown SIA licence (#1002-8849-1120-4491) expires in 14 days. Renewal verification required.',
        type: 'licence_expiry',
        priority: 'high',
        status: 'unread',
        actionUrl: '/compliance',
        metadata: { employeeName: 'David Brown', licenceNumber: '1002-8849-1120-4491', daysRemaining: 14 },
        emailSent: true,
        emailSentAt: new Date(now.getTime() - 1000 * 60 * 60 * 2),
      },
      {
        companyId,
        userId,
        title: 'Upcoming Shift Reminder — Tomorrow 06:00',
        message: 'Shift assigned at Westfield London (Job: Static Guard) starting tomorrow 06:00 to 18:00.',
        type: 'shift_reminder',
        priority: 'normal',
        status: 'unread',
        actionUrl: '/shifts',
        metadata: { siteName: 'Westfield London', startTime: '06:00', endTime: '18:00' },
        emailSent: true,
        emailSentAt: new Date(now.getTime() - 1000 * 60 * 60 * 5),
      },
      {
        companyId,
        userId,
        title: 'Leave Request Approved',
        message: 'Annual leave request for Sarah Jenkins (3 working days: 14 Oct - 16 Oct) has been approved by Operations Manager.',
        type: 'leave_decision',
        priority: 'normal',
        status: 'read',
        actionUrl: '/leave',
        metadata: { employeeName: 'Sarah Jenkins', leaveType: 'annual', days: 3 },
        emailSent: true,
        emailSentAt: new Date(now.getTime() - 1000 * 60 * 60 * 24),
        readAt: new Date(now.getTime() - 1000 * 60 * 60 * 12),
      },
      {
        companyId,
        userId,
        title: 'Compliance Alert: CCTV Operator Licence Expired',
        message: 'Employee Michael Roberts CCTV Licence (#0019-3382-7711-2041) expired yesterday. Shift allocation blocked.',
        type: 'compliance_alert',
        priority: 'urgent',
        status: 'unread',
        actionUrl: '/compliance',
        metadata: { employeeName: 'Michael Roberts', licenceNumber: '0019-3382-7711-2041' },
        emailSent: true,
        emailSentAt: new Date(now.getTime() - 1000 * 60 * 30),
      },
    ];

    samples.forEach((sample, idx) => {
      const id = randomUUID();
      const entity: NotificationEntity = {
        ...sample,
        id,
        createdAt: new Date(now.getTime() - 1000 * 60 * (idx * 35 + 10)),
        updatedAt: now,
      };
      this.notifications.set(id, entity);
    });
  }

  async findNotificationsByUser(
    companyId: string,
    userId?: string,
    options: {
      status?: NotificationStatus | 'all';
      type?: NotificationType | 'all';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: NotificationEntity[]; total: number; unreadCount: number }> {
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    const offset = Math.max(0, options.offset || 0);

    if (this.supabase) {
      try {
        let query = this.supabase
          .from('notifications')
          .select('*', { count: 'exact' })
          .eq('company_id', companyId);

        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }

        if (options.status && options.status !== 'all') {
          query = query.eq('status', options.status);
        }

        if (options.type && options.type !== 'all') {
          query = query.eq('type', options.type);
        }

        query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

        const { data, count, error } = await query;
        if (!error && data) {
          const items = data.map((r) => this.mapNotification(r));
          const { count: unread } = await this.supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'unread');

          return { items, total: count || items.length, unreadCount: unread || 0 };
        }
      } catch (err: any) {
        this.logger.error(`Supabase findNotificationsByUser exception: ${err.message}`);
      }
    }

    const companyNotifications = [...this.notifications.values()].filter(
      (n) => n.companyId === companyId
    );
    if (companyNotifications.length === 0) {
      this.seedSampleNotifications(companyId, userId);
    }

    let all = [...this.notifications.values()].filter((n) => {
      if (n.companyId !== companyId) return false;
      if (userId && n.userId && n.userId !== userId) return false;
      if (options.status && options.status !== 'all' && n.status !== options.status) return false;
      if (options.type && options.type !== 'all' && n.type !== options.type) return false;
      return true;
    });

    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const unreadCount = [...this.notifications.values()].filter(
      (n) => n.companyId === companyId && (!userId || !n.userId || n.userId === userId) && n.status === 'unread'
    ).length;

    const items = all.slice(offset, offset + limit);
    return { items, total: all.length, unreadCount };
  }

  async getUnreadNotificationsCount(companyId: string, userId?: string): Promise<number> {
    if (this.supabase) {
      try {
        let query = this.supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'unread');

        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }

        const { count, error } = await query;
        if (!error && count !== null) return count;
      } catch (err: any) {
        this.logger.error(`Supabase getUnreadNotificationsCount exception: ${err.message}`);
      }
    }

    const companyNotifications = [...this.notifications.values()].filter(
      (n) => n.companyId === companyId
    );
    if (companyNotifications.length === 0) {
      this.seedSampleNotifications(companyId, userId);
    }

    return [...this.notifications.values()].filter(
      (n) => n.companyId === companyId && (!userId || !n.userId || n.userId === userId) && n.status === 'unread'
    ).length;
  }

  async findNotificationById(companyId: string, id: string): Promise<NotificationEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('notifications')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) return this.mapNotification(data);
      } catch (err: any) {
        this.logger.error(`Supabase findNotificationById exception: ${err.message}`);
      }
    }

    const n = this.notifications.get(id);
    return n && n.companyId === companyId ? n : null;
  }

  async updateNotification(
    companyId: string,
    id: string,
    updates: Partial<Pick<NotificationEntity, 'status' | 'readAt' | 'emailSent' | 'emailSentAt'>>
  ): Promise<NotificationEntity | null> {
    const existing = await this.findNotificationById(companyId, id);
    if (!existing) return null;

    const now = new Date();
    const updated: NotificationEntity = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('notifications')
          .update({
            status: updates.status,
            read_at: updates.readAt?.toISOString() || (updates.status === 'read' ? now.toISOString() : null),
            email_sent: updates.emailSent !== undefined ? updates.emailSent : existing.emailSent,
            email_sent_at: updates.emailSentAt?.toISOString() || null,
            updated_at: now.toISOString(),
          })
          .eq('id', id)
          .eq('company_id', companyId)
          .select()
          .single();

        if (!error && row) return this.mapNotification(row);
      } catch (err: any) {
        this.logger.error(`Supabase updateNotification exception: ${err.message}`);
      }
    }

    this.notifications.set(id, updated);
    return updated;
  }

  async markAllNotificationsAsRead(companyId: string, userId?: string): Promise<number> {
    const now = new Date();
    let updatedCount = 0;

    if (this.supabase) {
      try {
        let query = this.supabase
          .from('notifications')
          .update({
            status: 'read',
            read_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('company_id', companyId)
          .eq('status', 'unread');

        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }

        const { count, error } = await query;
        if (!error && count !== null) return count;
      } catch (err: any) {
        this.logger.error(`Supabase markAllNotificationsAsRead exception: ${err.message}`);
      }
    }

    for (const [id, n] of this.notifications.entries()) {
      if (n.companyId === companyId && (!userId || !n.userId || n.userId === userId) && n.status === 'unread') {
        this.notifications.set(id, {
          ...n,
          status: 'read',
          readAt: now,
          updatedAt: now,
        });
        updatedCount++;
      }
    }

    return updatedCount;
  }

  async deleteNotification(companyId: string, id: string): Promise<boolean> {
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('notifications')
          .delete()
          .eq('company_id', companyId)
          .eq('id', id);

        if (!error) return true;
      } catch (err: any) {
        this.logger.error(`Supabase deleteNotification exception: ${err.message}`);
      }
    }

    const n = this.notifications.get(id);
    if (n && n.companyId === companyId) {
      this.notifications.delete(id);
      return true;
    }
    return false;
  }

  // ===========================
  // TIMESHEETS & PAYROLL FOUNDATION (PHASE 12)
  // ===========================

  private mapTimesheet(row: any): TimesheetEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      totalHours: parseFloat(row.total_hours || 0),
      regularHours: parseFloat(row.regular_hours || 0),
      overtimeHours: parseFloat(row.overtime_hours || 0),
      breakMinutes: parseInt(row.break_minutes || 0, 10),
      grossPay: parseFloat(row.gross_pay || 0),
      currency: row.currency || 'GBP',
      status: row.status,
      approvedBy: row.approved_by || undefined,
      approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
      notes: row.notes || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapTimesheetEntry(row: any): TimesheetEntryEntity {
    return {
      id: row.id,
      timesheetId: row.timesheet_id,
      attendanceRecordId: row.attendance_record_id || undefined,
      shiftId: row.shift_id || undefined,
      siteId: row.site_id,
      entryDate: row.entry_date,
      clockIn: new Date(row.clock_in),
      clockOut: new Date(row.clock_out),
      breakMinutes: parseInt(row.break_minutes || 0, 10),
      grossHours: parseFloat(row.gross_hours || 0),
      netHours: parseFloat(row.net_hours || 0),
      payRate: parseFloat(row.pay_rate || 0),
      totalPay: parseFloat(row.total_pay || 0),
      isOvertime: Boolean(row.is_overtime),
      adjustmentMinutes: parseInt(row.adjustment_minutes || 0, 10),
      adjustmentReason: row.adjustment_reason || undefined,
      adjustedBy: row.adjusted_by || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async createTimesheet(
    data: Omit<TimesheetEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<TimesheetEntity> {
    const id = randomUUID();
    const now = new Date();
    const entity: TimesheetEntity = { ...data, id, createdAt: now, updatedAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('timesheets')
          .insert({
            id,
            company_id: data.companyId,
            employee_id: data.employeeId,
            period_start: data.periodStart,
            period_end: data.periodEnd,
            total_hours: data.totalHours,
            regular_hours: data.regularHours,
            overtime_hours: data.overtimeHours,
            break_minutes: data.breakMinutes,
            gross_pay: data.grossPay,
            currency: data.currency,
            status: data.status,
            notes: data.notes || null,
          })
          .select()
          .single();
        if (!error && row) return this.mapTimesheet(row);
      } catch (err: any) {
        this.logger.error(`Supabase createTimesheet exception: ${err.message}`);
      }
    }

    this.timesheets.set(id, entity);
    return entity;
  }

  async createTimesheetEntry(
    data: Omit<TimesheetEntryEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<TimesheetEntryEntity> {
    const id = randomUUID();
    const now = new Date();
    const entity: TimesheetEntryEntity = { ...data, id, createdAt: now, updatedAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('timesheet_entries')
          .insert({
            id,
            timesheet_id: data.timesheetId,
            attendance_record_id: data.attendanceRecordId || null,
            shift_id: data.shiftId || null,
            site_id: data.siteId,
            entry_date: data.entryDate,
            clock_in: data.clockIn.toISOString(),
            clock_out: data.clockOut.toISOString(),
            break_minutes: data.breakMinutes,
            gross_hours: data.grossHours,
            net_hours: data.netHours,
            pay_rate: data.payRate,
            total_pay: data.totalPay,
            is_overtime: data.isOvertime,
            adjustment_minutes: data.adjustmentMinutes,
            adjustment_reason: data.adjustmentReason || null,
            adjusted_by: data.adjustedBy || null,
          })
          .select()
          .single();
        if (!error && row) return this.mapTimesheetEntry(row);
      } catch (err: any) {
        this.logger.error(`Supabase createTimesheetEntry exception: ${err.message}`);
      }
    }

    this.timesheetEntries.set(id, entity);
    return entity;
  }

  async findTimesheets(
    companyId: string,
    filters: {
      employeeId?: string;
      periodStart?: string;
      periodEnd?: string;
      status?: TimesheetStatus | 'all';
    } = {}
  ): Promise<TimesheetEntity[]> {
    if (this.supabase) {
      try {
        let query = this.supabase
          .from('timesheets')
          .select('*')
          .eq('company_id', companyId);

        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
        if (filters.periodStart) query = query.gte('period_start', filters.periodStart);
        if (filters.periodEnd) query = query.lte('period_end', filters.periodEnd);

        query = query.order('period_start', { ascending: false });

        const { data, error } = await query;
        if (!error && data) return data.map((r) => this.mapTimesheet(r));
      } catch (err: any) {
        this.logger.error(`Supabase findTimesheets exception: ${err.message}`);
      }
    }

    let all = [...this.timesheets.values()].filter((t) => {
      if (t.companyId !== companyId) return false;
      if (filters.employeeId && t.employeeId !== filters.employeeId) return false;
      if (filters.status && filters.status !== 'all' && t.status !== filters.status) return false;
      if (filters.periodStart && t.periodStart < filters.periodStart) return false;
      if (filters.periodEnd && t.periodEnd > filters.periodEnd) return false;
      return true;
    });

    return all.sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  }

  async findTimesheetById(companyId: string, id: string): Promise<TimesheetEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('timesheets')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) return this.mapTimesheet(data);
      } catch (err: any) {
        this.logger.error(`Supabase findTimesheetById exception: ${err.message}`);
      }
    }

    const t = this.timesheets.get(id);
    return t && t.companyId === companyId ? t : null;
  }

  async findTimesheetEntries(timesheetId: string): Promise<TimesheetEntryEntity[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('timesheet_entries')
          .select('*')
          .eq('timesheet_id', timesheetId)
          .order('entry_date', { ascending: true });

        if (!error && data) return data.map((r) => this.mapTimesheetEntry(r));
      } catch (err: any) {
        this.logger.error(`Supabase findTimesheetEntries exception: ${err.message}`);
      }
    }

    return [...this.timesheetEntries.values()]
      .filter((e) => e.timesheetId === timesheetId)
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  }

  async updateTimesheet(
    companyId: string,
    id: string,
    updates: Partial<Pick<TimesheetEntity, 'totalHours' | 'regularHours' | 'overtimeHours' | 'grossPay' | 'status' | 'approvedBy' | 'approvedAt' | 'notes'>>
  ): Promise<TimesheetEntity | null> {
    const existing = await this.findTimesheetById(companyId, id);
    if (!existing) return null;

    const now = new Date();
    const updated: TimesheetEntity = { ...existing, ...updates, updatedAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('timesheets')
          .update({
            total_hours: updates.totalHours !== undefined ? updates.totalHours : existing.totalHours,
            regular_hours: updates.regularHours !== undefined ? updates.regularHours : existing.regularHours,
            overtime_hours: updates.overtimeHours !== undefined ? updates.overtimeHours : existing.overtimeHours,
            gross_pay: updates.grossPay !== undefined ? updates.grossPay : existing.grossPay,
            status: updates.status || existing.status,
            approved_by: updates.approvedBy || null,
            approved_at: updates.approvedAt?.toISOString() || null,
            notes: updates.notes !== undefined ? updates.notes : existing.notes,
            updated_at: now.toISOString(),
          })
          .eq('id', id)
          .eq('company_id', companyId)
          .select()
          .single();

        if (!error && row) return this.mapTimesheet(row);
      } catch (err: any) {
        this.logger.error(`Supabase updateTimesheet exception: ${err.message}`);
      }
    }

    this.timesheets.set(id, updated);
    return updated;
  }

  async updateTimesheetEntry(
    timesheetId: string,
    id: string,
    updates: Partial<Pick<TimesheetEntryEntity, 'adjustmentMinutes' | 'adjustmentReason' | 'adjustedBy' | 'netHours' | 'totalPay' | 'isOvertime'>>
  ): Promise<TimesheetEntryEntity | null> {
    const entries = await this.findTimesheetEntries(timesheetId);
    const existing = entries.find((e) => e.id === id);
    if (!existing) return null;

    const now = new Date();
    const updated: TimesheetEntryEntity = { ...existing, ...updates, updatedAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('timesheet_entries')
          .update({
            adjustment_minutes: updates.adjustmentMinutes !== undefined ? updates.adjustmentMinutes : existing.adjustmentMinutes,
            adjustment_reason: updates.adjustmentReason !== undefined ? updates.adjustmentReason : existing.adjustmentReason,
            adjusted_by: updates.adjustedBy !== undefined ? updates.adjustedBy : existing.adjustedBy,
            net_hours: updates.netHours !== undefined ? updates.netHours : existing.netHours,
            total_pay: updates.totalPay !== undefined ? updates.totalPay : existing.totalPay,
            is_overtime: updates.isOvertime !== undefined ? updates.isOvertime : existing.isOvertime,
            updated_at: now.toISOString(),
          })
          .eq('id', id)
          .eq('timesheet_id', timesheetId)
          .select()
          .single();

        if (!error && row) return this.mapTimesheetEntry(row);
      } catch (err: any) {
        this.logger.error(`Supabase updateTimesheetEntry exception: ${err.message}`);
      }
    }

    this.timesheetEntries.set(id, updated);
    return updated;
  }

  // --- Phase 13: Pay Runs & Payslips Methods ---

  private mapPayRun(row: any): PayRunEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      paymentDate: row.payment_date,
      frequency: row.frequency,
      status: row.status,
      totalGross: parseFloat(row.total_gross || 0),
      totalTax: parseFloat(row.total_tax || 0),
      totalNi: parseFloat(row.total_ni || 0),
      totalNet: parseFloat(row.total_net || 0),
      totalEmployees: parseInt(row.total_employees || 0, 10),
      currency: row.currency || 'GBP',
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
      paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapPayslip(row: any): PayslipEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      payRunId: row.pay_run_id,
      employeeId: row.employee_id,
      timesheetId: row.timesheet_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      paymentDate: row.payment_date,
      regularHours: parseFloat(row.regular_hours || 0),
      overtimeHours: parseFloat(row.overtime_hours || 0),
      regularPay: parseFloat(row.regular_pay || 0),
      overtimePay: parseFloat(row.overtime_pay || 0),
      grossPay: parseFloat(row.gross_pay || 0),
      taxDeduction: parseFloat(row.tax_deduction || 0),
      nationalInsurance: parseFloat(row.national_insurance || 0),
      otherDeductions: parseFloat(row.other_deductions || 0),
      netPay: parseFloat(row.net_pay || 0),
      currency: row.currency || 'GBP',
      status: row.status,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async createPayRun(data: Omit<PayRunEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<PayRunEntity> {
    const id = randomUUID();
    const now = new Date();
    const entity: PayRunEntity = { id, ...data, createdAt: now, updatedAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('pay_runs')
          .insert({
            id,
            company_id: data.companyId,
            name: data.name,
            period_start: data.periodStart,
            period_end: data.periodEnd,
            payment_date: data.paymentDate,
            frequency: data.frequency,
            status: data.status,
            total_gross: data.totalGross,
            total_tax: data.totalTax,
            total_ni: data.totalNi,
            total_net: data.totalNet,
            total_employees: data.totalEmployees,
            currency: data.currency,
            approved_by: data.approvedBy,
            notes: data.notes,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .select()
          .single();

        if (!error && row) {
          const mapped = this.mapPayRun(row);
          this.payRuns.set(mapped.id, mapped);
          return mapped;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createPayRun exception: ${err.message}`);
      }
    }

    this.payRuns.set(id, entity);
    return entity;
  }

  async findPayRuns(
    companyId: string,
    filters: { status?: string; startDate?: string; endDate?: string } = {}
  ): Promise<PayRunEntity[]> {
    if (this.supabase) {
      try {
        let query = this.supabase.from('pay_runs').select('*').eq('company_id', companyId);
        if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
        if (filters.startDate) query = query.gte('period_start', filters.startDate);
        if (filters.endDate) query = query.lte('period_end', filters.endDate);

        const { data: rows, error } = await query.order('created_at', { ascending: false });
        if (!error && rows) return rows.map((r: any) => this.mapPayRun(r));
      } catch (err: any) {
        this.logger.error(`Supabase findPayRuns exception: ${err.message}`);
      }
    }

    let list = Array.from(this.payRuns.values()).filter((r) => r.companyId === companyId);
    if (filters.status && filters.status !== 'all') list = list.filter((r) => r.status === filters.status);
    if (filters.startDate) list = list.filter((r) => r.periodStart >= filters.startDate!);
    if (filters.endDate) list = list.filter((r) => r.periodEnd <= filters.endDate!);

    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findPayRunById(companyId: string, id: string): Promise<PayRunEntity | null> {
    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('pay_runs')
          .select('*')
          .eq('id', id)
          .eq('company_id', companyId)
          .single();

        if (!error && row) return this.mapPayRun(row);
      } catch (err: any) {
        this.logger.error(`Supabase findPayRunById exception: ${err.message}`);
      }
    }

    const item = this.payRuns.get(id);
    return item && item.companyId === companyId ? item : null;
  }

  async updatePayRun(
    companyId: string,
    id: string,
    updates: Partial<PayRunEntity>
  ): Promise<PayRunEntity | null> {
    const existing = await this.findPayRunById(companyId, id);
    if (!existing) return null;

    const now = new Date();
    const updated: PayRunEntity = { ...existing, ...updates, updatedAt: now };

    if (this.supabase) {
      try {
        const patch: Record<string, any> = { updated_at: now.toISOString() };
        if (updates.status !== undefined) patch.status = updates.status;
        if (updates.name !== undefined) patch.name = updates.name;
        if (updates.totalGross !== undefined) patch.total_gross = updates.totalGross;
        if (updates.totalTax !== undefined) patch.total_tax = updates.totalTax;
        if (updates.totalNi !== undefined) patch.total_ni = updates.totalNi;
        if (updates.totalNet !== undefined) patch.total_net = updates.totalNet;
        if (updates.totalEmployees !== undefined) patch.total_employees = updates.totalEmployees;
        if (updates.approvedBy !== undefined) patch.approved_by = updates.approvedBy;
        if (updates.approvedAt !== undefined) patch.approved_at = updates.approvedAt.toISOString();
        if (updates.paidAt !== undefined) patch.paid_at = updates.paidAt.toISOString();
        if (updates.notes !== undefined) patch.notes = updates.notes;

        const { data: row, error } = await this.supabase
          .from('pay_runs')
          .update(patch)
          .eq('id', id)
          .eq('company_id', companyId)
          .select()
          .single();

        if (!error && row) return this.mapPayRun(row);
      } catch (err: any) {
        this.logger.error(`Supabase updatePayRun exception: ${err.message}`);
      }
    }

    this.payRuns.set(id, updated);
    return updated;
  }

  async createPayslip(data: Omit<PayslipEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<PayslipEntity> {
    const id = randomUUID();
    const now = new Date();
    const entity: PayslipEntity = { id, ...data, createdAt: now, updatedAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('payslips')
          .insert({
            id,
            company_id: data.companyId,
            pay_run_id: data.payRunId,
            employee_id: data.employeeId,
            timesheet_id: data.timesheetId,
            period_start: data.periodStart,
            period_end: data.periodEnd,
            payment_date: data.paymentDate,
            regular_hours: data.regularHours,
            overtime_hours: data.overtimeHours,
            regular_pay: data.regularPay,
            overtime_pay: data.overtimePay,
            gross_pay: data.grossPay,
            tax_deduction: data.taxDeduction,
            national_insurance: data.nationalInsurance,
            other_deductions: data.otherDeductions,
            net_pay: data.netPay,
            currency: data.currency,
            status: data.status,
            notes: data.notes,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .select()
          .single();

        if (!error && row) {
          const mapped = this.mapPayslip(row);
          this.payslips.set(mapped.id, mapped);
          return mapped;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createPayslip exception: ${err.message}`);
      }
    }

    this.payslips.set(id, entity);
    return entity;
  }

  async findPayslips(
    companyId: string,
    filters: { payRunId?: string; employeeId?: string; status?: string } = {}
  ): Promise<PayslipEntity[]> {
    if (this.supabase) {
      try {
        let query = this.supabase.from('payslips').select('*').eq('company_id', companyId);
        if (filters.payRunId) query = query.eq('pay_run_id', filters.payRunId);
        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);

        const { data: rows, error } = await query.order('created_at', { ascending: false });
        if (!error && rows) return rows.map((r: any) => this.mapPayslip(r));
      } catch (err: any) {
        this.logger.error(`Supabase findPayslips exception: ${err.message}`);
      }
    }

    let list = Array.from(this.payslips.values()).filter((p) => p.companyId === companyId);
    if (filters.payRunId) list = list.filter((p) => p.payRunId === filters.payRunId);
    if (filters.employeeId) list = list.filter((p) => p.employeeId === filters.employeeId);
    if (filters.status && filters.status !== 'all') list = list.filter((p) => p.status === filters.status);

    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findPayslipById(companyId: string, id: string): Promise<PayslipEntity | null> {
    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('payslips')
          .select('*')
          .eq('id', id)
          .eq('company_id', companyId)
          .single();

        if (!error && row) return this.mapPayslip(row);
      } catch (err: any) {
        this.logger.error(`Supabase findPayslipById exception: ${err.message}`);
      }
    }

    const item = this.payslips.get(id);
    return item && item.companyId === companyId ? item : null;
  }

  async updatePayslip(
    companyId: string,
    id: string,
    updates: Partial<PayslipEntity>
  ): Promise<PayslipEntity | null> {
    const existing = await this.findPayslipById(companyId, id);
    if (!existing) return null;

    const now = new Date();
    const updated: PayslipEntity = { ...existing, ...updates, updatedAt: now };

    if (this.supabase) {
      try {
        const patch: Record<string, any> = { updated_at: now.toISOString() };
        if (updates.status !== undefined) patch.status = updates.status;
        if (updates.notes !== undefined) patch.notes = updates.notes;

        const { data: row, error } = await this.supabase
          .from('payslips')
          .update(patch)
          .eq('id', id)
          .eq('company_id', companyId)
          .select()
          .single();

        if (!error && row) return this.mapPayslip(row);
      } catch (err: any) {
        this.logger.error(`Supabase updatePayslip exception: ${err.message}`);
      }
    }

    this.payslips.set(id, updated);
    return updated;
  }

  // --- Phase 14: Clients, Contracts & Invoicing Methods ---

  private mapClient(row: any): ClientEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      companyNumber: row.company_number,
      vatNumber: row.vat_number,
      billingEmail: row.billing_email,
      phone: row.phone,
      address: row.address,
      status: row.status,
      paymentTermsDays: parseInt(row.payment_terms_days || 30, 10),
      currency: row.currency || 'GBP',
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapContract(row: any): ContractEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      clientId: row.client_id,
      siteId: row.site_id,
      contractNumber: row.contract_number,
      title: row.title,
      startDate: row.start_date,
      endDate: row.end_date,
      billingCycle: row.billing_cycle,
      hourlyBillingRate: parseFloat(row.hourly_billing_rate || 0),
      status: row.status,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapInvoice(row: any): InvoiceEntity {
    return {
      id: row.id,
      companyId: row.company_id,
      clientId: row.client_id,
      contractId: row.contract_id,
      invoiceNumber: row.invoice_number,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      subtotal: parseFloat(row.subtotal || 0),
      taxRate: parseFloat(row.tax_rate || 20),
      taxAmount: parseFloat(row.tax_amount || 0),
      totalAmount: parseFloat(row.total_amount || 0),
      currency: row.currency || 'GBP',
      status: row.status,
      paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapInvoiceItem(row: any): InvoiceItemEntity {
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      siteId: row.site_id,
      jobTypeId: row.job_type_id,
      description: row.description,
      hours: parseFloat(row.hours || 0),
      rate: parseFloat(row.rate || 0),
      totalAmount: parseFloat(row.total_amount || 0),
      createdAt: new Date(row.created_at),
    };
  }

  async createClient(data: Omit<ClientEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<ClientEntity> {
    const id = randomUUID();
    const now = new Date();
    const entity: ClientEntity = { id, ...data, createdAt: now, updatedAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('clients')
          .insert({
            id,
            company_id: data.companyId,
            name: data.name,
            company_number: data.companyNumber,
            vat_number: data.vatNumber,
            billing_email: data.billingEmail,
            phone: data.phone,
            address: data.address,
            status: data.status,
            payment_terms_days: data.paymentTermsDays,
            currency: data.currency,
            notes: data.notes,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .select()
          .single();

        if (!error && row) {
          const mapped = this.mapClient(row);
          this.clients.set(mapped.id, mapped);
          return mapped;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createClient exception: ${err.message}`);
      }
    }

    this.clients.set(id, entity);
    return entity;
  }

  async findClients(
    companyId: string,
    filters: { status?: string; search?: string } = {}
  ): Promise<ClientEntity[]> {
    if (this.supabase) {
      try {
        let query = this.supabase.from('clients').select('*').eq('company_id', companyId);
        if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
        if (filters.search) query = query.ilike('name', `%${filters.search}%`);

        const { data: rows, error } = await query.order('created_at', { ascending: false });
        if (!error && rows) return rows.map((r: any) => this.mapClient(r));
      } catch (err: any) {
        this.logger.error(`Supabase findClients exception: ${err.message}`);
      }
    }

    let list = Array.from(this.clients.values()).filter((c) => c.companyId === companyId);
    if (filters.status && filters.status !== 'all') list = list.filter((c) => c.status === filters.status);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.billingEmail.toLowerCase().includes(q));
    }

    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findClientById(companyId: string, id: string): Promise<ClientEntity | null> {
    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('clients')
          .select('*')
          .eq('id', id)
          .eq('company_id', companyId)
          .single();

        if (!error && row) return this.mapClient(row);
      } catch (err: any) {
        this.logger.error(`Supabase findClientById exception: ${err.message}`);
      }
    }

    const item = this.clients.get(id);
    return item && item.companyId === companyId ? item : null;
  }

  async updateClient(
    companyId: string,
    id: string,
    updates: Partial<ClientEntity>
  ): Promise<ClientEntity | null> {
    const existing = await this.findClientById(companyId, id);
    if (!existing) return null;

    const now = new Date();
    const updated: ClientEntity = { ...existing, ...updates, updatedAt: now };

    if (this.supabase) {
      try {
        const patch: Record<string, any> = { updated_at: now.toISOString() };
        if (updates.name !== undefined) patch.name = updates.name;
        if (updates.billingEmail !== undefined) patch.billing_email = updates.billingEmail;
        if (updates.phone !== undefined) patch.phone = updates.phone;
        if (updates.address !== undefined) patch.address = updates.address;
        if (updates.status !== undefined) patch.status = updates.status;
        if (updates.paymentTermsDays !== undefined) patch.payment_terms_days = updates.paymentTermsDays;
        if (updates.notes !== undefined) patch.notes = updates.notes;

        const { data: row, error } = await this.supabase
          .from('clients')
          .update(patch)
          .eq('id', id)
          .eq('company_id', companyId)
          .select()
          .single();

        if (!error && row) return this.mapClient(row);
      } catch (err: any) {
        this.logger.error(`Supabase updateClient exception: ${err.message}`);
      }
    }

    this.clients.set(id, updated);
    return updated;
  }

  async deleteClient(companyId: string, id: string): Promise<boolean> {
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('clients')
          .delete()
          .eq('company_id', companyId)
          .eq('id', id);

        if (!error) {
          this.clients.delete(id);
          return true;
        }
      } catch (err: any) {
        this.logger.error(`Supabase deleteClient exception: ${err.message}`);
      }
    }

    const cl = this.clients.get(id);
    if (cl && cl.companyId === companyId) {
      this.clients.delete(id);
      return true;
    }
    return false;
  }

  async createContract(data: Omit<ContractEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<ContractEntity> {
    const id = randomUUID();
    const now = new Date();
    const entity: ContractEntity = { id, ...data, createdAt: now, updatedAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('contracts')
          .insert({
            id,
            company_id: data.companyId,
            client_id: data.clientId,
            site_id: data.siteId,
            contract_number: data.contractNumber,
            title: data.title,
            start_date: data.startDate,
            end_date: data.endDate,
            billing_cycle: data.billingCycle,
            hourly_billing_rate: data.hourlyBillingRate,
            status: data.status,
            notes: data.notes,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .select()
          .single();

        if (!error && row) {
          const mapped = this.mapContract(row);
          this.contracts.set(mapped.id, mapped);
          return mapped;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createContract exception: ${err.message}`);
      }
    }

    this.contracts.set(id, entity);
    return entity;
  }

  async findContracts(
    companyId: string,
    filters: { clientId?: string; siteId?: string; status?: string } = {}
  ): Promise<ContractEntity[]> {
    if (this.supabase) {
      try {
        let query = this.supabase.from('contracts').select('*').eq('company_id', companyId);
        if (filters.clientId) query = query.eq('client_id', filters.clientId);
        if (filters.siteId) query = query.eq('site_id', filters.siteId);
        if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);

        const { data: rows, error } = await query.order('created_at', { ascending: false });
        if (!error && rows) return rows.map((r: any) => this.mapContract(r));
      } catch (err: any) {
        this.logger.error(`Supabase findContracts exception: ${err.message}`);
      }
    }

    let list = Array.from(this.contracts.values()).filter((c) => c.companyId === companyId);
    if (filters.clientId) list = list.filter((c) => c.clientId === filters.clientId);
    if (filters.siteId) list = list.filter((c) => c.siteId === filters.siteId);
    if (filters.status && filters.status !== 'all') list = list.filter((c) => c.status === filters.status);

    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findContractById(companyId: string, id: string): Promise<ContractEntity | null> {
    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('contracts')
          .select('*')
          .eq('id', id)
          .eq('company_id', companyId)
          .single();

        if (!error && row) return this.mapContract(row);
      } catch (err: any) {
        this.logger.error(`Supabase findContractById exception: ${err.message}`);
      }
    }

    const item = this.contracts.get(id);
    return item && item.companyId === companyId ? item : null;
  }

  async updateContract(
    companyId: string,
    id: string,
    updates: Partial<ContractEntity>
  ): Promise<ContractEntity | null> {
    const existing = await this.findContractById(companyId, id);
    if (!existing) return null;

    const now = new Date();
    const updated: ContractEntity = { ...existing, ...updates, updatedAt: now };

    if (this.supabase) {
      try {
        const patch: Record<string, any> = { updated_at: now.toISOString() };
        if (updates.title !== undefined) patch.title = updates.title;
        if (updates.contractNumber !== undefined) patch.contract_number = updates.contractNumber;
        if (updates.startDate !== undefined) patch.start_date = updates.startDate;
        if (updates.endDate !== undefined) patch.end_date = updates.endDate;
        if (updates.billingCycle !== undefined) patch.billing_cycle = updates.billingCycle;
        if (updates.hourlyBillingRate !== undefined) patch.hourly_billing_rate = updates.hourlyBillingRate;
        if (updates.status !== undefined) patch.status = updates.status;
        if (updates.notes !== undefined) patch.notes = updates.notes;

        const { data: row, error } = await this.supabase
          .from('contracts')
          .update(patch)
          .eq('id', id)
          .eq('company_id', companyId)
          .select()
          .single();

        if (!error && row) return this.mapContract(row);
      } catch (err: any) {
        this.logger.error(`Supabase updateContract exception: ${err.message}`);
      }
    }

    this.contracts.set(id, updated);
    return updated;
  }

  async deleteContract(companyId: string, id: string): Promise<boolean> {
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('contracts')
          .delete()
          .eq('company_id', companyId)
          .eq('id', id);

        if (!error) {
          this.contracts.delete(id);
          return true;
        }
      } catch (err: any) {
        this.logger.error(`Supabase deleteContract exception: ${err.message}`);
      }
    }

    const c = this.contracts.get(id);
    if (c && c.companyId === companyId) {
      this.contracts.delete(id);
      return true;
    }
    return false;
  }

  async createInvoice(data: Omit<InvoiceEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<InvoiceEntity> {
    const id = randomUUID();
    const now = new Date();
    const entity: InvoiceEntity = { id, ...data, createdAt: now, updatedAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('invoices')
          .insert({
            id,
            company_id: data.companyId,
            client_id: data.clientId,
            contract_id: data.contractId,
            invoice_number: data.invoiceNumber,
            issue_date: data.issueDate,
            due_date: data.dueDate,
            subtotal: data.subtotal,
            tax_rate: data.taxRate,
            tax_amount: data.taxAmount,
            total_amount: data.totalAmount,
            currency: data.currency,
            status: data.status,
            notes: data.notes,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .select()
          .single();

        if (!error && row) {
          const mapped = this.mapInvoice(row);
          this.invoices.set(mapped.id, mapped);
          return mapped;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createInvoice exception: ${err.message}`);
      }
    }

    this.invoices.set(id, entity);
    return entity;
  }

  async findInvoices(
    companyId: string,
    filters: { clientId?: string; status?: string; startDate?: string; endDate?: string } = {}
  ): Promise<InvoiceEntity[]> {
    if (this.supabase) {
      try {
        let query = this.supabase.from('invoices').select('*').eq('company_id', companyId);
        if (filters.clientId) query = query.eq('client_id', filters.clientId);
        if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
        if (filters.startDate) query = query.gte('issue_date', filters.startDate);
        if (filters.endDate) query = query.lte('issue_date', filters.endDate);

        const { data: rows, error } = await query.order('created_at', { ascending: false });
        if (!error && rows) return rows.map((r: any) => this.mapInvoice(r));
      } catch (err: any) {
        this.logger.error(`Supabase findInvoices exception: ${err.message}`);
      }
    }

    let list = Array.from(this.invoices.values()).filter((i) => i.companyId === companyId);
    if (filters.clientId) list = list.filter((i) => i.clientId === filters.clientId);
    if (filters.status && filters.status !== 'all') list = list.filter((i) => i.status === filters.status);
    if (filters.startDate) list = list.filter((i) => i.issueDate >= filters.startDate!);
    if (filters.endDate) list = list.filter((i) => i.issueDate <= filters.endDate!);

    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findInvoiceById(companyId: string, id: string): Promise<InvoiceEntity | null> {
    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('invoices')
          .select('*')
          .eq('id', id)
          .eq('company_id', companyId)
          .single();

        if (!error && row) return this.mapInvoice(row);
      } catch (err: any) {
        this.logger.error(`Supabase findInvoiceById exception: ${err.message}`);
      }
    }

    const item = this.invoices.get(id);
    return item && item.companyId === companyId ? item : null;
  }

  async updateInvoice(
    companyId: string,
    id: string,
    updates: Partial<InvoiceEntity>
  ): Promise<InvoiceEntity | null> {
    const existing = await this.findInvoiceById(companyId, id);
    if (!existing) return null;

    const now = new Date();
    const updated: InvoiceEntity = { ...existing, ...updates, updatedAt: now };

    if (this.supabase) {
      try {
        const patch: Record<string, any> = { updated_at: now.toISOString() };
        if (updates.status !== undefined) patch.status = updates.status;
        if (updates.paidAt !== undefined) patch.paid_at = updates.paidAt.toISOString();
        if (updates.notes !== undefined) patch.notes = updates.notes;

        const { data: row, error } = await this.supabase
          .from('invoices')
          .update(patch)
          .eq('id', id)
          .eq('company_id', companyId)
          .select()
          .single();

        if (!error && row) return this.mapInvoice(row);
      } catch (err: any) {
        this.logger.error(`Supabase updateInvoice exception: ${err.message}`);
      }
    }

    this.invoices.set(id, updated);
    return updated;
  }

  async createInvoiceItem(data: Omit<InvoiceItemEntity, 'id' | 'createdAt'>): Promise<InvoiceItemEntity> {
    const id = randomUUID();
    const now = new Date();
    const entity: InvoiceItemEntity = { id, ...data, createdAt: now };

    if (this.supabase) {
      try {
        const { data: row, error } = await this.supabase
          .from('invoice_items')
          .insert({
            id,
            invoice_id: data.invoiceId,
            site_id: data.siteId,
            job_type_id: data.jobTypeId,
            description: data.description,
            hours: data.hours,
            rate: data.rate,
            total_amount: data.totalAmount,
            created_at: now.toISOString(),
          })
          .select()
          .single();

        if (!error && row) {
          const mapped = this.mapInvoiceItem(row);
          this.invoiceItems.set(mapped.id, mapped);
          return mapped;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createInvoiceItem exception: ${err.message}`);
      }
    }

    this.invoiceItems.set(id, entity);
    return entity;
  }

  async findInvoiceItems(invoiceId: string): Promise<InvoiceItemEntity[]> {
    if (this.supabase) {
      try {
        const { data: rows, error } = await this.supabase
          .from('invoice_items')
          .select('*')
          .eq('invoice_id', invoiceId)
          .order('created_at', { ascending: true });

        if (!error && rows) return rows.map((r: any) => this.mapInvoiceItem(r));
      } catch (err: any) {
        this.logger.error(`Supabase findInvoiceItems exception: ${err.message}`);
      }
    }

    return Array.from(this.invoiceItems.values()).filter((item) => item.invoiceId === invoiceId);
  }

  // --- INVITATION OPERATIONS (SPEC SECTION 11, 16) ---
  async createInvitation(
    data: Omit<InvitationEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<InvitationEntity> {
    const id = randomUUID();
    const now = new Date();

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('invitations')
          .insert({
            id,
            company_id: data.companyId,
            email: data.email.toLowerCase().trim(),
            role: data.role,
            target_type: data.targetType,
            target_id: data.targetId || null,
            token_hash: data.tokenHash,
            status: data.status || 'pending',
            expires_at: data.expiresAt.toISOString(),
            invited_by: data.invitedBy || null,
          })
          .select()
          .single();

        if (!error && inserted) {
          const inv = this.mapInvitation(inserted);
          this.invitations.set(inv.id, inv);
          return inv;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createInvitation exception: ${err.message}`);
      }
    }

    const invitation: InvitationEntity = {
      ...data,
      id,
      email: data.email.toLowerCase().trim(),
      createdAt: now,
      updatedAt: now,
    };
    this.invitations.set(id, invitation);
    return invitation;
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<InvitationEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('invitations')
          .select('*')
          .eq('token_hash', tokenHash)
          .maybeSingle();

        if (!error && data) {
          return this.mapInvitation(data);
        }
      } catch (err: any) {
        this.logger.error(`Supabase findInvitationByTokenHash exception: ${err.message}`);
      }
    }

    for (const inv of this.invitations.values()) {
      if (inv.tokenHash === tokenHash) {
        return inv;
      }
    }
    return null;
  }

  async findInvitationsByCompany(companyId: string): Promise<InvitationEntity[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('invitations')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data.map((d: any) => this.mapInvitation(d));
        }
      } catch (err: any) {
        this.logger.error(`Supabase findInvitationsByCompany exception: ${err.message}`);
      }
    }

    return Array.from(this.invitations.values())
      .filter((inv) => inv.companyId === companyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateInvitationStatus(
    id: string,
    status: InvitationStatus,
    acceptedAt?: Date
  ): Promise<void> {
    if (this.supabase) {
      try {
        await this.supabase
          .from('invitations')
          .update({
            status,
            accepted_at: acceptedAt ? acceptedAt.toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      } catch (err: any) {
        this.logger.error(`Supabase updateInvitationStatus exception: ${err.message}`);
      }
    }

    const inv = this.invitations.get(id);
    if (inv) {
      inv.status = status;
      if (acceptedAt) inv.acceptedAt = acceptedAt;
      inv.updatedAt = new Date();
      this.invitations.set(id, inv);
    }
  }

  async deleteInvitation(id: string): Promise<void> {
    if (this.supabase) {
      try {
        await this.supabase.from('invitations').delete().eq('id', id);
      } catch (err: any) {
        this.logger.error(`Supabase deleteInvitation exception: ${err.message}`);
      }
    }
    this.invitations.delete(id);
  }

  // --- USER DEVICE OPERATIONS (SPEC SECTION 28) ---
  async createUserDevice(
    data: Omit<UserDeviceEntity, 'id' | 'createdAt'>
  ): Promise<UserDeviceEntity> {
    const id = randomUUID();
    const now = new Date();

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('user_devices')
          .insert({
            id,
            user_id: data.userId,
            device_type: data.deviceType,
            platform: data.platform || null,
            push_token: data.pushToken,
            last_seen_at: data.lastSeenAt.toISOString(),
          })
          .select()
          .single();

        if (!error && inserted) {
          const dev = this.mapUserDevice(inserted);
          this.userDevices.set(dev.id, dev);
          return dev;
        }
      } catch (err: any) {
        this.logger.error(`Supabase createUserDevice exception: ${err.message}`);
      }
    }

    const device: UserDeviceEntity = {
      ...data,
      id,
      createdAt: now,
    };
    this.userDevices.set(id, device);
    return device;
  }

  async findUserDevices(userId: string): Promise<UserDeviceEntity[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('user_devices')
          .select('*')
          .eq('user_id', userId)
          .is('revoked_at', null);

        if (!error && data) {
          return data.map((d: any) => this.mapUserDevice(d));
        }
      } catch (err: any) {
        this.logger.error(`Supabase findUserDevices exception: ${err.message}`);
      }
    }

    return Array.from(this.userDevices.values()).filter(
      (d) => d.userId === userId && !d.revokedAt
    );
  }

  async revokeUserDevice(id: string): Promise<void> {
    if (this.supabase) {
      try {
        await this.supabase
          .from('user_devices')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', id);
      } catch (err: any) {
        this.logger.error(`Supabase revokeUserDevice exception: ${err.message}`);
      }
    }

    const dev = this.userDevices.get(id);
    if (dev) {
      dev.revokedAt = new Date();
      this.userDevices.set(id, dev);
    }
  }

  // --- CHAT OPERATIONS (REAL-TIME CONVERSATIONS & MESSAGES) ---
  async findChatConversations(companyId: string, employeeId?: string): Promise<ChatConversationEntity[]> {
    if (this.supabase) {
      try {
        let query = this.supabase
          .from('chat_conversations')
          .select('*')
          .eq('company_id', companyId)
          .order('last_message_at', { ascending: false });

        if (employeeId) {
          query = query.eq('employee_id', employeeId);
        }

        const { data, error } = await query;
        if (!error && data) {
          return data.map((r: any) => ({
            id: r.id,
            companyId: r.company_id,
            employeeId: r.employee_id,
            createdBy: r.created_by,
            lastMessageAt: new Date(r.last_message_at),
            lastMessagePreview: r.last_message_preview,
            createdAt: new Date(r.created_at),
            updatedAt: new Date(r.updated_at),
          }));
        }
      } catch (err: any) {
        this.logger.error(`Supabase findChatConversations exception: ${err.message}`);
      }
    }

    return Array.from(this.chatConversations.values())
      .filter((c) => c.companyId === companyId && (!employeeId || c.employeeId === employeeId))
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }

  async findChatConversationById(companyId: string, id: string): Promise<ChatConversationEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('chat_conversations')
          .select('*')
          .eq('company_id', companyId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            companyId: data.company_id,
            employeeId: data.employee_id,
            createdBy: data.created_by,
            lastMessageAt: new Date(data.last_message_at),
            lastMessagePreview: data.last_message_preview,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at),
          };
        }
      } catch (err: any) {
        this.logger.error(`Supabase findChatConversationById exception: ${err.message}`);
      }
    }

    const conv = this.chatConversations.get(id);
    return conv && conv.companyId === companyId ? conv : null;
  }

  async findChatConversationByEmployee(companyId: string, employeeId: string): Promise<ChatConversationEntity | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('chat_conversations')
          .select('*')
          .eq('company_id', companyId)
          .eq('employee_id', employeeId)
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            companyId: data.company_id,
            employeeId: data.employee_id,
            createdBy: data.created_by,
            lastMessageAt: new Date(data.last_message_at),
            lastMessagePreview: data.last_message_preview,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at),
          };
        }
      } catch (err: any) {
        this.logger.error(`Supabase findChatConversationByEmployee exception: ${err.message}`);
      }
    }

    for (const conv of this.chatConversations.values()) {
      if (conv.companyId === companyId && conv.employeeId === employeeId) {
        return conv;
      }
    }
    return null;
  }

  async createChatConversation(data: Partial<ChatConversationEntity>): Promise<ChatConversationEntity> {
    const id = data.id || randomUUID();
    const now = new Date();
    const entity: ChatConversationEntity = {
      id,
      companyId: data.companyId!,
      employeeId: data.employeeId!,
      createdBy: data.createdBy,
      lastMessageAt: data.lastMessageAt || now,
      lastMessagePreview: data.lastMessagePreview || '',
      createdAt: now,
      updatedAt: now,
    };

    if (this.supabase) {
      try {
        await this.supabase.from('chat_conversations').insert({
          id: entity.id,
          company_id: entity.companyId,
          employee_id: entity.employeeId,
          created_by: entity.createdBy,
          last_message_at: entity.lastMessageAt.toISOString(),
          last_message_preview: entity.lastMessagePreview,
          created_at: entity.createdAt.toISOString(),
          updated_at: entity.updatedAt.toISOString(),
        });
      } catch (err: any) {
        this.logger.error(`Supabase createChatConversation exception: ${err.message}`);
      }
    }

    this.chatConversations.set(id, entity);
    return entity;
  }

  async updateChatConversation(
    companyId: string,
    id: string,
    updates: Partial<ChatConversationEntity>
  ): Promise<ChatConversationEntity | null> {
    const existing = await this.findChatConversationById(companyId, id);
    if (!existing) return null;

    const updated: ChatConversationEntity = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    if (this.supabase) {
      try {
        await this.supabase
          .from('chat_conversations')
          .update({
            last_message_at: updated.lastMessageAt.toISOString(),
            last_message_preview: updated.lastMessagePreview,
            updated_at: updated.updatedAt.toISOString(),
          })
          .eq('id', id);
      } catch (err: any) {
        this.logger.error(`Supabase updateChatConversation exception: ${err.message}`);
      }
    }

    this.chatConversations.set(id, updated);
    return updated;
  }

  async findChatMessages(companyId: string, conversationId: string, limit = 100): Promise<ChatMessageEntity[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('chat_messages')
          .select('*')
          .eq('company_id', companyId)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(limit);

        if (!error && data) {
          return data.map((r: any) => ({
            id: r.id,
            conversationId: r.conversation_id,
            companyId: r.company_id,
            senderId: r.sender_id,
            senderRole: r.sender_role,
            senderName: r.sender_name,
            content: r.content,
            isRead: Boolean(r.is_read),
            readAt: r.read_at ? new Date(r.read_at) : undefined,
            createdAt: new Date(r.created_at),
          }));
        }
      } catch (err: any) {
        this.logger.error(`Supabase findChatMessages exception: ${err.message}`);
      }
    }

    return Array.from(this.chatMessages.values())
      .filter((m) => m.companyId === companyId && m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-limit);
  }

  async createChatMessage(data: Partial<ChatMessageEntity>): Promise<ChatMessageEntity> {
    const id = data.id || randomUUID();
    const now = new Date();
    const entity: ChatMessageEntity = {
      id,
      conversationId: data.conversationId!,
      companyId: data.companyId!,
      senderId: data.senderId!,
      senderRole: data.senderRole!,
      senderName: data.senderName!,
      content: data.content!,
      isRead: false,
      readAt: undefined,
      createdAt: now,
    };

    if (this.supabase) {
      try {
        await this.supabase.from('chat_messages').insert({
          id: entity.id,
          conversation_id: entity.conversationId,
          company_id: entity.companyId,
          sender_id: entity.senderId,
          sender_role: entity.senderRole,
          sender_name: entity.senderName,
          content: entity.content,
          is_read: entity.isRead,
          created_at: entity.createdAt.toISOString(),
        });
      } catch (err: any) {
        this.logger.error(`Supabase createChatMessage exception: ${err.message}`);
      }
    }

    this.chatMessages.set(id, entity);

    // Automatically touch the conversation's last_message_at and preview
    await this.updateChatConversation(entity.companyId, entity.conversationId, {
      lastMessageAt: now,
      lastMessagePreview: entity.content.substring(0, 100),
    });

    return entity;
  }

  async markChatMessagesAsRead(
    companyId: string,
    conversationId: string,
    readerRole: 'COMPANY' | 'EMPLOYEE'
  ): Promise<void> {
    const targetSenderRole = readerRole === 'COMPANY' ? 'EMPLOYEE' : 'COMPANY';
    const now = new Date();

    if (this.supabase) {
      try {
        await this.supabase
          .from('chat_messages')
          .update({ is_read: true, read_at: now.toISOString() })
          .eq('company_id', companyId)
          .eq('conversation_id', conversationId)
          .eq('sender_role', targetSenderRole)
          .eq('is_read', false);
      } catch (err: any) {
        this.logger.error(`Supabase markChatMessagesAsRead exception: ${err.message}`);
      }
    }

    for (const msg of this.chatMessages.values()) {
      if (
        msg.companyId === companyId &&
        msg.conversationId === conversationId &&
        msg.senderRole === targetSenderRole &&
        !msg.isRead
      ) {
        msg.isRead = true;
        msg.readAt = now;
        this.chatMessages.set(msg.id, msg);
      }
    }
  }

  async getUnreadChatCount(companyId: string, role: 'COMPANY' | 'EMPLOYEE', employeeId?: string): Promise<number> {
    const targetSenderRole = role === 'COMPANY' ? 'EMPLOYEE' : 'COMPANY';

    if (this.supabase) {
      try {
        let query = this.supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('sender_role', targetSenderRole)
          .eq('is_read', false);

        if (role === 'EMPLOYEE' && employeeId) {
          const conv = await this.findChatConversationByEmployee(companyId, employeeId);
          if (conv) {
            query = query.eq('conversation_id', conv.id);
          } else {
            return 0;
          }
        }

        const { count, error } = await query;
        if (!error && typeof count === 'number') {
          return count;
        }
      } catch (err: any) {
        this.logger.error(`Supabase getUnreadChatCount exception: ${err.message}`);
      }
    }

    let unreadCount = 0;
    for (const msg of this.chatMessages.values()) {
      if (msg.companyId === companyId && msg.senderRole === targetSenderRole && !msg.isRead) {
        if (role === 'EMPLOYEE' && employeeId) {
          const conv = this.chatConversations.get(msg.conversationId);
          if (conv && conv.employeeId === employeeId) {
            unreadCount++;
          }
        } else {
          unreadCount++;
        }
      }
    }
    return unreadCount;
  }
}



