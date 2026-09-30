import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { GenerateReportDto, ReportType } from './dto/generate-report.dto';

export interface ReportResult {
  type: ReportType;
  generatedAt: string;
  filters: {
    startDate?: string;
    endDate?: string;
    siteId?: string;
    employeeId?: string;
  };
  summary: Record<string, number | string>;
  rows: Record<string, any>[];
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly db: DatabaseService) {}

  async generate(companyId: string, dto: GenerateReportDto): Promise<ReportResult> {
    const filters = {
      startDate: dto.startDate,
      endDate: dto.endDate,
      siteId: dto.siteId,
      employeeId: dto.employeeId,
    };

    switch (dto.type) {
      case 'employees':
        return this.employeesReport(companyId, filters);
      case 'attendance':
        return this.attendanceReport(companyId, filters);
      case 'hours':
        return this.hoursReport(companyId, filters);
      case 'absences':
        return this.absencesReport(companyId, filters);
      case 'shifts':
        return this.shiftsReport(companyId, filters);
      case 'licences':
        return this.licencesReport(companyId, filters);
      case 'assignments':
        return this.assignmentsReport(companyId, filters);
      default:
        return this.employeesReport(companyId, filters);
    }
  }

  // ─── Employee Report ────────────────────────────────────────────────────────
  private async employeesReport(
    companyId: string,
    filters: { startDate?: string; endDate?: string }
  ): Promise<ReportResult> {
    const result = await this.db.findEmployees(companyId, { page: 1, limit: 1000 });
    const employees = result.items;

    const statusCounts = employees.reduce<Record<string, number>>((acc, emp) => {
      acc[emp.employmentStatus] = (acc[emp.employmentStatus] || 0) + 1;
      return acc;
    }, {});

    const rows = employees.map((emp) => ({
      employeeNumber: emp.employeeNumber,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phone: emp.phone,
      status: emp.employmentStatus,
      startDate: emp.employmentStartDate,
    }));

    return {
      type: 'employees',
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        total: employees.length,
        active: statusCounts['active'] || 0,
        probation: statusCounts['probation'] || 0,
        suspended: statusCounts['suspended'] || 0,
        terminated: statusCounts['terminated'] || 0,
        on_leave: statusCounts['on_leave'] || 0,
      },
      rows,
    };
  }

  // ─── Attendance Report ──────────────────────────────────────────────────────
  private async attendanceReport(
    companyId: string,
    filters: { startDate?: string; endDate?: string; siteId?: string; employeeId?: string }
  ): Promise<ReportResult> {
    const records = await this.db.findAttendanceRecords(companyId, {
      siteId: filters.siteId,
      employeeId: filters.employeeId,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    const statusCounts = records.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0);
    const flagged = records.filter((r) => r.varianceFlag !== 'none').length;

    const rows = records.map((r) => ({
      date: r.clockInTime.toISOString().split('T')[0],
      employeeId: r.employeeId,
      siteId: r.siteId,
      clockIn: r.clockInTime.toISOString(),
      clockOut: r.clockOutTime?.toISOString() || '',
      totalHours: r.totalHours,
      status: r.status,
      varianceFlag: r.varianceFlag,
      geofenceVerified: r.clockInVerified,
    }));

    return {
      type: 'attendance',
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        totalRecords: records.length,
        totalHours: Math.round(totalHours * 100) / 100,
        flaggedRecords: flagged,
        ...statusCounts,
      },
      rows,
    };
  }

  // ─── Hours Report ───────────────────────────────────────────────────────────
  private async hoursReport(
    companyId: string,
    filters: { startDate?: string; endDate?: string; employeeId?: string }
  ): Promise<ReportResult> {
    const records = await this.db.findAttendanceRecords(companyId, {
      employeeId: filters.employeeId,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    // Aggregate by employee
    const byEmployee: Record<string, { totalHours: number; shifts: number; name?: string }> = {};
    for (const r of records) {
      if (r.status === 'clocked_in' || r.status === 'on_break') continue; // exclude in-progress
      if (!byEmployee[r.employeeId]) {
        byEmployee[r.employeeId] = { totalHours: 0, shifts: 0 };
      }
      byEmployee[r.employeeId].totalHours += r.totalHours || 0;
      byEmployee[r.employeeId].shifts += 1;
    }

    const totalHours = Object.values(byEmployee).reduce((s, v) => s + v.totalHours, 0);

    const rows = Object.entries(byEmployee).map(([empId, data]) => ({
      employeeId: empId,
      totalHours: Math.round(data.totalHours * 100) / 100,
      shifts: data.shifts,
      avgHoursPerShift:
        data.shifts > 0 ? Math.round((data.totalHours / data.shifts) * 100) / 100 : 0,
    }));

    return {
      type: 'hours',
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        totalEmployees: rows.length,
        totalHours: Math.round(totalHours * 100) / 100,
        totalShifts: Object.values(byEmployee).reduce((s, v) => s + v.shifts, 0),
      },
      rows: rows.sort((a, b) => b.totalHours - a.totalHours),
    };
  }

  // ─── Absences Report ────────────────────────────────────────────────────────
  private async absencesReport(
    companyId: string,
    filters: { startDate?: string; endDate?: string; employeeId?: string }
  ): Promise<ReportResult> {
    const leaves = await this.db.findLeaveRequests(companyId, {
      employeeId: filters.employeeId,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    const approved = leaves.filter((l) => l.status === 'approved');
    const totalDays = approved.reduce((s, l) => s + l.totalDays, 0);

    const byType = approved.reduce<Record<string, number>>((acc, l) => {
      acc[l.leaveType] = (acc[l.leaveType] || 0) + l.totalDays;
      return acc;
    }, {});

    const rows = leaves.map((l) => ({
      employeeId: l.employeeId,
      employeeName: l.employee
        ? `${l.employee.firstName} ${l.employee.lastName}`
        : l.employeeId,
      leaveType: l.leaveType,
      startDate: l.startDate,
      endDate: l.endDate,
      totalDays: l.totalDays,
      status: l.status,
      reason: l.reason || '',
    }));

    return {
      type: 'absences',
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        totalRequests: leaves.length,
        approved: approved.length,
        pending: leaves.filter((l) => l.status === 'pending').length,
        totalAbsenceDays: totalDays,
        ...byType,
      },
      rows,
    };
  }

  // ─── Shifts Report ──────────────────────────────────────────────────────────
  private async shiftsReport(
    companyId: string,
    filters: { startDate?: string; endDate?: string; siteId?: string }
  ): Promise<ReportResult> {
    const shifts = await this.db.findShifts(companyId, {
      siteId: filters.siteId,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    const statusCounts = shifts.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});

    const openPositions = shifts.filter((s) => !s.employeeId).length;

    const rows = shifts.map((s) => ({
      date: s.shiftDate,
      siteId: s.siteId,
      siteJobId: s.siteJobId,
      employeeId: s.employeeId || 'OPEN',
      startTime: s.startTime,
      endTime: s.endTime,
      breakMinutes: s.breakMinutes,
      status: s.status,
    }));

    return {
      type: 'shifts',
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        totalShifts: shifts.length,
        openPositions,
        filled: shifts.length - openPositions,
        ...statusCounts,
      },
      rows,
    };
  }

  // ─── Licences Report ────────────────────────────────────────────────────────
  private async licencesReport(
    companyId: string,
    filters: { employeeId?: string }
  ): Promise<ReportResult> {
    const { items: licences } = await this.db.findLicences(companyId, {
      employeeId: filters.employeeId,
      limit: 1000,
    });

    const statusCounts = licences.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    }, {});

    const today = new Date().toISOString().split('T')[0];
    const expiringSoon = licences.filter(
      (l) => l.expiryDate >= today && l.status === 'expiring_soon'
    ).length;

    const rows = licences.map((l) => ({
      employeeId: l.employeeId,
      licenceType: l.licenceType,
      licenceNumber: l.licenceNumber,
      expiryDate: l.expiryDate,
      status: l.status,
      verifiedAt: l.verifiedAt?.toISOString() || '',
    }));

    return {
      type: 'licences',
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        total: licences.length,
        valid: statusCounts['valid'] || 0,
        expiringSoon,
        expired: statusCounts['expired'] || 0,
        pendingVerification: statusCounts['pending_verification'] || 0,
      },
      rows,
    };
  }

  // ─── Assignments Report ─────────────────────────────────────────────────────
  private async assignmentsReport(
    companyId: string,
    filters: { startDate?: string; endDate?: string; employeeId?: string }
  ): Promise<ReportResult> {
    // If an employeeId filter is provided, fetch for that employee only.
    // Otherwise fetch all employees and aggregate.
    let assignments: any[] = [];
    if (filters.employeeId) {
      assignments = await this.db.findAssignmentsByEmployeeId(companyId, filters.employeeId);
    } else {
      const empResult = await this.db.findEmployees(companyId, { page: 1, limit: 1000 });
      for (const emp of empResult.items) {
        const empAssignments = await this.db.findAssignmentsByEmployeeId(companyId, emp.id);
        assignments.push(...empAssignments);
      }
    }

    const statusCounts = assignments.reduce<Record<string, number>>((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {});

    const rows = assignments.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      siteJobId: a.siteJobId,
      payRate: a.payRate,
      startDate: a.startDate,
      endDate: a.endDate || 'Active',
      status: a.status,
    }));

    return {
      type: 'assignments',
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        total: assignments.length,
        active: statusCounts['active'] || 0,
        completed: statusCounts['completed'] || 0,
        transferred: statusCounts['transferred'] || 0,
      },
      rows,
    };
  }

  /**
   * Convert ReportResult rows to CSV string (server-side, no dependencies).
   */
  toCSV(report: ReportResult): string {
    if (report.rows.length === 0) return '';
    const headers = Object.keys(report.rows[0]);
    const lines = [
      headers.join(','),
      ...report.rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h] ?? '';
            const str = String(val).replace(/"/g, '""');
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str}"`
              : str;
          })
          .join(',')
      ),
    ];
    return lines.join('\n');
  }
}
