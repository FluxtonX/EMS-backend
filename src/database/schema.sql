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
  employee_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  emergency_contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'probation', 'suspended', 'terminated', 'on_leave')),
  employment_start_date DATE NOT NULL,
  employment_end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_company_employee_number UNIQUE (company_id, employee_number)
);

CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(company_id, employment_status);
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

