-- ====================================================================
-- Employee Management Platform — Production Database Schema
-- Architecture: Multi-Tenant Supabase PostgreSQL
-- ====================================================================

-- Enable pgcrypto for UUID generation if not already active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. COMPANIES (TENANTS)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  registration_number TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  subscription_tier TEXT NOT NULL DEFAULT 'standard' CHECK (subscription_tier IN ('standard', 'pro', 'enterprise')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on company slug
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);

-- 2. USERS (SYSTEM IDENTITIES)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on user email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 3. COMPANY MEMBERSHIPS (TENANT USER ASSOCIATIONS + ROLES)
CREATE TABLE IF NOT EXISTS company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('Owner', 'Admin', 'Manager', 'Supervisor', 'Employee')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_company_user UNIQUE (company_id, user_id)
);

-- Indexes for fast multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_role ON company_members(role);

-- 4. AUDIT LOGS (SECURITY & AUDITABILITY)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 5. EMPLOYEES (PERMANENT WORKFORCE RECORDS - SECTION 18 & 20)
-- Note: Zero assignment/site/job/rate columns here! Current assignment is derived from assignment records.
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  employee_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  emergency_contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'probation', 'suspended', 'terminated', 'on_leave')),
  account_status TEXT NOT NULL DEFAULT 'invited' CHECK (account_status IN ('invited', 'active', 'suspended', 'disabled')),
  employment_start_date DATE NOT NULL,
  employment_end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_company_employee_number UNIQUE (company_id, employee_number)
);

-- Idempotent column assertions for existing databases
ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'invited';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth DATE DEFAULT '1990-01-01';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(company_id, employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_account_status ON employees(company_id, account_status);
CREATE INDEX IF NOT EXISTS idx_employees_number ON employees(company_id, employee_number);

-- 6. EMPLOYEE LICENCES (SIA / COMPLIANCE TRACKING - SECTION 42)
CREATE TABLE IF NOT EXISTS employee_licences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  licence_type TEXT NOT NULL, -- e.g. 'SIA Door Supervisor', 'SIA Security Guard', 'SIA CCTV'
  licence_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'expiring_soon', 'expired', 'pending_verification', 'rejected')),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_licences_company ON employee_licences(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_licences_employee ON employee_licences(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_licences_expiry ON employee_licences(expiry_date);

-- 7. DOCUMENTS (PRIVATE DOCUMENTS METADATA)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- e.g. 'Passport', 'RightToWork', 'SIA_Badge_Scan', 'ProofOfAddress'
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_employee_id ON documents(employee_id);

-- 8. SITES (PHYSICAL WORKFORCE DEPLOYMENT LOCATIONS - SECTION 17, 21)
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL, -- e.g. 'CW-01', unique per company
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  geofence_radius INTEGER NOT NULL DEFAULT 200, -- Geofence radius in meters (Section 41)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_company_site_code UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_sites_company_id ON sites(company_id);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(company_id, status);

-- 9. JOB TYPES (GLOBAL/COMPANY-WIDE ROLES - SECTION 21)
CREATE TABLE IF NOT EXISTS job_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. 'Security Guard', 'Door Supervisor', 'CCTV Operator'
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_company_job_name UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_job_types_company_id ON job_types(company_id);

-- 10. SITE JOBS / RATES MATRIX (SECTION 21)
-- One global job type can have distinct default pay & billing rates per site without duplicating data
CREATE TABLE IF NOT EXISTS site_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  job_type_id UUID NOT NULL REFERENCES job_types(id) ON DELETE CASCADE,
  default_pay_rate NUMERIC(10, 2) NOT NULL CHECK (default_pay_rate >= 0),
  billing_rate NUMERIC(10, 2) NOT NULL CHECK (billing_rate >= 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_site_job UNIQUE (site_id, job_type_id)
);

CREATE INDEX IF NOT EXISTS idx_site_jobs_site_id ON site_jobs(site_id);
CREATE INDEX IF NOT EXISTS idx_site_jobs_company_id ON site_jobs(company_id);

-- 11. ASSIGNMENTS (OPERATIONAL WORKFORCE PLACEMENT - SECTION 22, 37, 38)
-- Stores historically agreed rates at the point of assignment.
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  site_job_id UUID NOT NULL REFERENCES site_jobs(id) ON DELETE RESTRICT,
  pay_rate NUMERIC(10, 2) NOT NULL CHECK (pay_rate >= 0),
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'transferred', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_assignment_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_assignments_company_id ON assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_assignments_employee_id ON assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_assignments_site_job_id ON assignments(site_job_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(company_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_dates ON assignments(start_date, end_date);

-- 12. SHIFTS (SCHEDULING & ROSTERING - SECTION 39, 40)
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  site_job_id UUID NOT NULL REFERENCES site_jobs(id) ON DELETE RESTRICT,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL, -- NULL indicates an Open Position
  shift_date DATE NOT NULL,
  start_time TEXT NOT NULL, -- e.g. '06:00'
  end_time TEXT NOT NULL,   -- e.g. '18:00'
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_company_date ON shifts(company_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shifts_site_date ON shifts(site_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shifts_employee_date ON shifts(employee_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(company_id, status);

-- 13. ATTENDANCE RECORDS (TIME TRACKING & GEOFENCING - SECTION 41, 42, 43, 44)
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  clock_in_time TIMESTAMPTZ NOT NULL,
  clock_out_time TIMESTAMPTZ,
  clock_in_lat NUMERIC(10, 7),
  clock_in_lng NUMERIC(10, 7),
  clock_in_accuracy NUMERIC(8, 2), -- Accuracy in meters
  clock_in_distance NUMERIC(10, 2), -- Calculated distance to site geofence in meters
  clock_in_verified BOOLEAN NOT NULL DEFAULT true,
  clock_out_lat NUMERIC(10, 7),
  clock_out_lng NUMERIC(10, 7),
  clock_out_accuracy NUMERIC(8, 2),
  clock_out_distance NUMERIC(10, 2),
  clock_out_verified BOOLEAN NOT NULL DEFAULT true,
  break_start_time TIMESTAMPTZ,
  break_end_time TIMESTAMPTZ,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  total_hours NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (total_hours >= 0),
  status TEXT NOT NULL DEFAULT 'clocked_in' CHECK (status IN ('clocked_in', 'on_break', 'clocked_out', 'reconciled', 'flagged', 'rejected')),
  variance_flag TEXT NOT NULL DEFAULT 'none' CHECK (variance_flag IN ('none', 'late_arrival', 'early_departure', 'out_of_geofence', 'overtime', 'unmatched_shift')),
  supervisor_notes TEXT,
  reconciled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_company_clock_in ON attendance_records(company_id, clock_in_time);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id, clock_in_time);
CREATE INDEX IF NOT EXISTS idx_attendance_site ON attendance_records(site_id, clock_in_time);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance_records(company_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_variance ON attendance_records(company_id, variance_flag);

-- 14. LEAVE REQUESTS (PHASE 9)
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'sick', 'emergency', 'unpaid', 'other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  working_days NUMERIC(4, 1) NOT NULL DEFAULT 1 CHECK (working_days > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_leave_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company ON leave_requests(company_id, start_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id, status);

-- 15. EMPLOYEE AVAILABILITY (PHASE 9)
CREATE TABLE IF NOT EXISTS employee_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  is_available BOOLEAN NOT NULL DEFAULT true,
  preferred_start_time TEXT,
  preferred_end_time TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_employee_day_availability UNIQUE (company_id, employee_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_availability_employee ON employee_availability(employee_id);

-- 16. NOTIFICATIONS (PHASE 11)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('licence_expiry', 'shift_assigned', 'shift_reminder', 'leave_decision', 'account_event', 'compliance_alert', 'system')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  action_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications(company_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(company_id, type);

-- 17. TIMESHEETS (PHASE 12 — PAYROLL FOUNDATION)
CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_hours NUMERIC(7, 2) NOT NULL DEFAULT 0 CHECK (total_hours >= 0),
  regular_hours NUMERIC(7, 2) NOT NULL DEFAULT 0 CHECK (regular_hours >= 0),
  overtime_hours NUMERIC(7, 2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  gross_pay NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (gross_pay >= 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'locked', 'rejected')),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_timesheet_employee_period UNIQUE (company_id, employee_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_timesheets_company_period ON timesheets(company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_timesheets_employee ON timesheets(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(company_id, status);

-- 18. TIMESHEET ENTRIES / LINE ITEMS (PHASE 12)
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  attendance_record_id UUID REFERENCES attendance_records(id) ON DELETE SET NULL,
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  gross_hours NUMERIC(5, 2) NOT NULL CHECK (gross_hours >= 0),
  net_hours NUMERIC(5, 2) NOT NULL CHECK (net_hours >= 0),
  pay_rate NUMERIC(10, 2) NOT NULL CHECK (pay_rate >= 0),
  total_pay NUMERIC(10, 2) NOT NULL CHECK (total_pay >= 0),
  is_overtime BOOLEAN NOT NULL DEFAULT false,
  adjustment_minutes INTEGER NOT NULL DEFAULT 0,
  adjustment_reason TEXT,
  adjusted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet ON timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_date ON timesheet_entries(entry_date);

-- Phase 13: Pay Runs & Payslips
CREATE TABLE IF NOT EXISTS pay_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_date DATE NOT NULL,
  frequency VARCHAR(50) NOT NULL DEFAULT 'monthly',
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  total_gross NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_ni NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_net NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_employees INT NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_runs_company ON pay_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_pay_runs_period ON pay_runs(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_pay_runs_status ON pay_runs(status);

CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pay_run_id UUID NOT NULL REFERENCES pay_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  timesheet_id UUID REFERENCES timesheets(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_date DATE NOT NULL,
  regular_hours NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
  overtime_hours NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
  regular_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  overtime_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  gross_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  tax_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  national_insurance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  other_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  net_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payslips_company ON payslips(company_id);
CREATE INDEX IF NOT EXISTS idx_payslips_pay_run ON payslips(pay_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);

-- Phase 14: Clients, Contracts & Invoicing
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  company_number VARCHAR(100),
  vat_number VARCHAR(100),
  billing_email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, inactive
  payment_terms_days INT NOT NULL DEFAULT 30,
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  contract_number VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  billing_cycle VARCHAR(50) NOT NULL DEFAULT 'monthly', -- weekly, bi_weekly, monthly
  hourly_billing_rate NUMERIC(10, 2) NOT NULL DEFAULT 24.00,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, expired, terminated
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_company ON contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_site ON contracts(site_id);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  invoice_number VARCHAR(100) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 20.00, -- UK 20% VAT
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, sent, paid, overdue, void
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  job_type_id UUID REFERENCES job_types(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  hours NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- 19. INVITATIONS (SECURE TOKEN-BASED ONBOARDING - SPEC SECTIONS 11, 16)
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'OPERATOR', 'EMPLOYEE', 'Owner', 'Admin', 'Manager', 'Supervisor', 'Employee')),
  target_type TEXT NOT NULL CHECK (target_type IN ('team_member', 'employee')),
  target_id UUID, -- References employees(id) if target_type = 'employee'
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_company ON invitations(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

-- 20. USER DEVICES (PUSH NOTIFICATIONS - SPEC SECTION 28)
CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_type TEXT NOT NULL CHECK (device_type IN ('web', 'android', 'ios')),
  platform TEXT,
  push_token TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id) WHERE revoked_at IS NULL;

-- 21. CHAT CONVERSATIONS (COMPANY & EMPLOYEE REAL-TIME MESSAGING)
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_company_employee_chat UNIQUE (company_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_company ON chat_conversations(company_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_employee ON chat_conversations(employee_id);

-- 22. CHAT MESSAGES
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('COMPANY', 'EMPLOYEE')),
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages(conversation_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_chat_messages_company ON chat_messages(company_id);
