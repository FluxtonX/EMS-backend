export enum Role {
  Owner = 'Owner',
  Admin = 'Admin',
  Manager = 'Manager',
  Supervisor = 'Supervisor',
  Operator = 'Supervisor',
  Employee = 'Employee',

  // Canonical Spec Roles (Spec Section 4: OWNER, MANAGER, OPERATOR, EMPLOYEE)
  OWNER = 'Owner',
  MANAGER = 'Manager',
  OPERATOR = 'Supervisor',
  EMPLOYEE = 'Employee',
}

export function normalizeRole(role: string | null | undefined): Role {
  if (!role) return Role.Employee;
  const upper = role.trim().toUpperCase();
  if (upper === 'OWNER') return Role.Owner;
  if (upper === 'ADMIN') return Role.Admin;
  if (upper === 'MANAGER') return Role.Manager;
  if (upper === 'OPERATOR' || upper === 'SUPERVISOR') return Role.Supervisor;
  if (upper === 'EMPLOYEE') return Role.Employee;
  return role as Role;
}
