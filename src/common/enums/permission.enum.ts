import { Role, normalizeRole } from './role.enum';

export enum Permission {
  // Company & Members
  COMPANY_MANAGE = 'company:manage',
  COMPANY_VIEW = 'company:view',
  MEMBER_MANAGE = 'member:manage',
  MEMBER_VIEW = 'member:view',

  // Employees
  EMPLOYEE_CREATE = 'employee:create',
  EMPLOYEE_READ = 'employee:read',
  EMPLOYEE_UPDATE = 'employee:update',
  EMPLOYEE_DELETE = 'employee:delete',

  // Sites & Jobs
  SITE_MANAGE = 'site:manage',
  SITE_VIEW = 'site:view',
  JOB_MANAGE = 'job:manage',
  JOB_VIEW = 'job:view',

  // Assignments & Transfers
  ASSIGNMENT_MANAGE = 'assignment:manage',
  ASSIGNMENT_VIEW = 'assignment:view',

  // Shifts
  SHIFT_MANAGE = 'shift:manage',
  SHIFT_VIEW = 'shift:view',

  // Attendance
  ATTENDANCE_MANAGE = 'attendance:manage',
  ATTENDANCE_CLOCK = 'attendance:clock',
  ATTENDANCE_VIEW = 'attendance:view',

  // Documents & Licences
  DOCUMENT_UPLOAD = 'document:upload',
  DOCUMENT_VERIFY = 'document:verify',
  DOCUMENT_VIEW = 'document:view',
  DOCUMENT_DELETE = 'document:delete',
  LICENCE_MANAGE = 'licence:manage',
  LICENCE_VIEW = 'licence:view',

  // Leave & Availability
  LEAVE_APPROVE = 'leave:approve',
  LEAVE_REQUEST = 'leave:request',

  // Reports & Audits
  REPORT_VIEW = 'report:view',
  AUDIT_VIEW = 'audit:view',

  // Notifications
  NOTIFICATION_VIEW = 'notification:view',
  NOTIFICATION_MANAGE = 'notification:manage',

  // Timesheets & Payroll Foundation (Phase 12)
  TIMESHEET_VIEW = 'timesheet:view',
  TIMESHEET_MANAGE = 'timesheet:manage',
  TIMESHEET_APPROVE = 'timesheet:approve',

  // Payroll & Payslips (Phase 13)
  PAYROLL_VIEW = 'payroll:view',
  PAYROLL_MANAGE = 'payroll:manage',
  PAYROLL_APPROVE = 'payroll:approve',
  PAYSLIP_VIEW = 'payslip:view',

  // Clients, Contracts & Invoicing (Phase 14)
  CLIENT_VIEW = 'client:view',
  CLIENT_MANAGE = 'client:manage',
  CONTRACT_VIEW = 'contract:view',
  CONTRACT_MANAGE = 'contract:manage',
  INVOICE_VIEW = 'invoice:view',
  INVOICE_MANAGE = 'invoice:manage',
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.Owner]: Object.values(Permission),
  [Role.Admin]: [
    Permission.COMPANY_VIEW,
    Permission.MEMBER_MANAGE,
    Permission.MEMBER_VIEW,
    Permission.EMPLOYEE_CREATE,
    Permission.EMPLOYEE_READ,
    Permission.EMPLOYEE_UPDATE,
    Permission.EMPLOYEE_DELETE,
    Permission.SITE_MANAGE,
    Permission.SITE_VIEW,
    Permission.JOB_MANAGE,
    Permission.JOB_VIEW,
    Permission.ASSIGNMENT_MANAGE,
    Permission.ASSIGNMENT_VIEW,
    Permission.SHIFT_MANAGE,
    Permission.SHIFT_VIEW,
    Permission.ATTENDANCE_MANAGE,
    Permission.ATTENDANCE_CLOCK,
    Permission.ATTENDANCE_VIEW,
    Permission.DOCUMENT_UPLOAD,
    Permission.DOCUMENT_VERIFY,
    Permission.DOCUMENT_VIEW,
    Permission.DOCUMENT_DELETE,
    Permission.LICENCE_MANAGE,
    Permission.LICENCE_VIEW,
    Permission.LEAVE_APPROVE,
    Permission.LEAVE_REQUEST,
    Permission.REPORT_VIEW,
    Permission.AUDIT_VIEW,
    Permission.NOTIFICATION_VIEW,
    Permission.NOTIFICATION_MANAGE,
    Permission.TIMESHEET_VIEW,
    Permission.TIMESHEET_MANAGE,
    Permission.TIMESHEET_APPROVE,
    Permission.PAYROLL_VIEW,
    Permission.PAYROLL_MANAGE,
    Permission.PAYROLL_APPROVE,
    Permission.PAYSLIP_VIEW,
    Permission.CLIENT_VIEW,
    Permission.CLIENT_MANAGE,
    Permission.CONTRACT_VIEW,
    Permission.CONTRACT_MANAGE,
    Permission.INVOICE_VIEW,
    Permission.INVOICE_MANAGE,
  ],
  [Role.Manager]: [
    Permission.COMPANY_VIEW,
    Permission.MEMBER_VIEW,
    Permission.EMPLOYEE_CREATE,
    Permission.EMPLOYEE_READ,
    Permission.EMPLOYEE_UPDATE,
    Permission.SITE_VIEW,
    Permission.JOB_VIEW,
    Permission.ASSIGNMENT_MANAGE,
    Permission.ASSIGNMENT_VIEW,
    Permission.SHIFT_MANAGE,
    Permission.SHIFT_VIEW,
    Permission.ATTENDANCE_MANAGE,
    Permission.ATTENDANCE_CLOCK,
    Permission.ATTENDANCE_VIEW,
    Permission.DOCUMENT_UPLOAD,
    Permission.DOCUMENT_VERIFY,
    Permission.DOCUMENT_VIEW,
    Permission.DOCUMENT_DELETE,
    Permission.LICENCE_MANAGE,
    Permission.LICENCE_VIEW,
    Permission.LEAVE_APPROVE,
    Permission.LEAVE_REQUEST,
    Permission.REPORT_VIEW,
    Permission.NOTIFICATION_VIEW,
    Permission.NOTIFICATION_MANAGE,
    Permission.TIMESHEET_VIEW,
    Permission.TIMESHEET_MANAGE,
    Permission.TIMESHEET_APPROVE,
    Permission.PAYROLL_VIEW,
    Permission.PAYROLL_MANAGE,
    Permission.PAYROLL_APPROVE,
    Permission.PAYSLIP_VIEW,
    Permission.CLIENT_VIEW,
    Permission.CLIENT_MANAGE,
    Permission.CONTRACT_VIEW,
    Permission.CONTRACT_MANAGE,
    Permission.INVOICE_VIEW,
    Permission.INVOICE_MANAGE,
  ],
  [Role.Supervisor]: [
    Permission.COMPANY_VIEW,
    Permission.EMPLOYEE_READ,
    Permission.SITE_VIEW,
    Permission.JOB_VIEW,
    Permission.ASSIGNMENT_VIEW,
    Permission.SHIFT_MANAGE,
    Permission.SHIFT_VIEW,
    Permission.ATTENDANCE_CLOCK,
    Permission.ATTENDANCE_VIEW,
    Permission.DOCUMENT_VIEW,
    Permission.LICENCE_VIEW,
    Permission.LEAVE_REQUEST,
    Permission.NOTIFICATION_VIEW,
    Permission.TIMESHEET_VIEW,
    Permission.TIMESHEET_MANAGE,
    Permission.PAYROLL_VIEW,
    Permission.PAYSLIP_VIEW,
    Permission.CLIENT_VIEW,
    Permission.CONTRACT_VIEW,
  ],
  [Role.Employee]: [
    Permission.SHIFT_VIEW,
    Permission.ATTENDANCE_CLOCK,
    Permission.DOCUMENT_UPLOAD,
    Permission.DOCUMENT_VIEW,
    Permission.LICENCE_VIEW,
    Permission.LEAVE_REQUEST,
    Permission.NOTIFICATION_VIEW,
    Permission.TIMESHEET_VIEW,
    Permission.PAYSLIP_VIEW,
  ],
};

export function getPermissionsForRole(role: Role | string): Permission[] {
  const normalized = normalizeRole(role as any);
  return ROLE_PERMISSIONS[normalized] || [];
}
