import { Role } from './role.enum';

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
  DOCUMENT_VERIFY = 'document:verify',
  DOCUMENT_VIEW = 'document:view',

  // Leave & Availability
  LEAVE_APPROVE = 'leave:approve',
  LEAVE_REQUEST = 'leave:request',

  // Reports & Audits
  REPORT_VIEW = 'report:view',
  AUDIT_VIEW = 'audit:view',
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
    Permission.DOCUMENT_VERIFY,
    Permission.DOCUMENT_VIEW,
    Permission.LEAVE_APPROVE,
    Permission.LEAVE_REQUEST,
    Permission.REPORT_VIEW,
    Permission.AUDIT_VIEW,
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
    Permission.DOCUMENT_VERIFY,
    Permission.DOCUMENT_VIEW,
    Permission.LEAVE_APPROVE,
    Permission.LEAVE_REQUEST,
    Permission.REPORT_VIEW,
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
    Permission.LEAVE_REQUEST,
  ],
  [Role.Employee]: [
    Permission.SHIFT_VIEW,
    Permission.ATTENDANCE_CLOCK,
    Permission.DOCUMENT_VIEW,
    Permission.LEAVE_REQUEST,
  ],
};

export function getPermissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}
