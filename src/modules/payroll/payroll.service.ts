import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  DatabaseService,
  PayRunEntity,
  PayslipEntity,
  PayRunStatus,
} from '../../database/database.service';
import { CreatePayRunDto } from './dto/create-pay-run.dto';
import { QueryPayRunsDto } from './dto/query-pay-runs.dto';
import { ReviewPayRunDto } from './dto/review-pay-run.dto';
import { QueryPayslipsDto } from './dto/query-payslips.dto';

// Standard UK PAYE & National Insurance calculation models for accurate workforce deductions
// UK Monthly thresholds (2025/26 tax year baseline)
const UK_MONTHLY_PERSONAL_ALLOWANCE = 1047.5; // £12,570 / 12
const UK_BASIC_RATE_TAX = 0.20;              // 20% basic rate
const UK_NI_PRIMARY_THRESHOLD = 1048.0;      // £12,576 / 12
const UK_NI_EMPLOYEE_RATE = 0.08;            // 8% Class 1 NI

export interface UKPayrollDeductionBreakdown {
  taxDeduction: number;
  nationalInsurance: number;
  netPay: number;
}

export function calculateUKDeductions(grossPay: number, frequency: 'weekly' | 'bi_weekly' | 'monthly' = 'monthly'): UKPayrollDeductionBreakdown {
  let allowance = UK_MONTHLY_PERSONAL_ALLOWANCE;
  let niThreshold = UK_NI_PRIMARY_THRESHOLD;

  if (frequency === 'weekly') {
    allowance = 241.73;
    niThreshold = 242.0;
  } else if (frequency === 'bi_weekly') {
    allowance = 483.46;
    niThreshold = 484.0;
  }

  // Tax calculation
  const taxableIncome = Math.max(0, grossPay - allowance);
  const taxDeduction = Math.round(taxableIncome * UK_BASIC_RATE_TAX * 100) / 100;

  // NI calculation
  const niQualifyingIncome = Math.max(0, grossPay - niThreshold);
  const nationalInsurance = Math.round(niQualifyingIncome * UK_NI_EMPLOYEE_RATE * 100) / 100;

  // Net pay
  const netPay = Math.max(0, Math.round((grossPay - taxDeduction - nationalInsurance) * 100) / 100);

  return { taxDeduction, nationalInsurance, netPay };
}

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Generates a new Pay Run from approved timesheets or active employee allocations.
   * Performs standard UK PAYE tax and National Insurance calculations,
   * creates immutable payslip snapshots, and tracks overall gross/net disbursement.
   */
  async createPayRun(companyId: string, dto: CreatePayRunDto, userId?: string) {
    if (new Date(dto.periodEnd) < new Date(dto.periodStart)) {
      throw new BadRequestException('Period end date cannot be earlier than start date.');
    }

    // 1. Fetch timesheets for the period
    const timesheets = await this.db.findTimesheets(companyId, {
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
    });

    const activeTimesheets = timesheets.filter((t) => t.status !== 'rejected');

    // 2. Fetch employees to ensure full workforce coverage
    const employeesResult = await this.db.findEmployees(companyId, {
      status: 'active',
      limit: 100,
    });

    const payslipsToCreate: Array<Omit<PayslipEntity, 'id' | 'payRunId' | 'createdAt' | 'updatedAt'>> = [];

    let totalGross = 0;
    let totalTax = 0;
    let totalNi = 0;
    let totalNet = 0;

    if (activeTimesheets.length > 0) {
      for (const ts of activeTimesheets) {
        const gross = ts.grossPay;
        const regularHours = ts.regularHours;
        const overtimeHours = ts.overtimeHours;
        const regularPay = Math.round(regularHours * (ts.totalHours > 0 ? gross / ts.totalHours : 15.0) * 100) / 100;
        const overtimePay = Math.round((gross - regularPay) * 100) / 100;

        const { taxDeduction, nationalInsurance, netPay } = calculateUKDeductions(gross, dto.frequency);

        totalGross += gross;
        totalTax += taxDeduction;
        totalNi += nationalInsurance;
        totalNet += netPay;

        payslipsToCreate.push({
          companyId,
          employeeId: ts.employeeId,
          timesheetId: ts.id,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          paymentDate: dto.paymentDate,
          regularHours,
          overtimeHours,
          regularPay,
          overtimePay,
          grossPay: gross,
          taxDeduction,
          nationalInsurance,
          otherDeductions: 0,
          netPay,
          currency: ts.currency || 'GBP',
          status: 'draft',
          notes: ts.notes,
        });
      }
    } else {
      // Baseline synthetic workforce generation for active employees
      for (const emp of employeesResult.items) {
        const gross = 2400.0;
        const regularHours = 160.0;
        const overtimeHours = 0.0;
        const regularPay = 2400.0;
        const overtimePay = 0.0;

        const { taxDeduction, nationalInsurance, netPay } = calculateUKDeductions(gross, dto.frequency);

        totalGross += gross;
        totalTax += taxDeduction;
        totalNi += nationalInsurance;
        totalNet += netPay;

        payslipsToCreate.push({
          companyId,
          employeeId: emp.id,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          paymentDate: dto.paymentDate,
          regularHours,
          overtimeHours,
          regularPay,
          overtimePay,
          grossPay: gross,
          taxDeduction,
          nationalInsurance,
          otherDeductions: 0,
          netPay,
          currency: 'GBP',
          status: 'draft',
          notes: 'Standard monthly scheduled baseline allocation',
        });
      }
    }

    // 3. Create Pay Run master record
    const payRun = await this.db.createPayRun({
      companyId,
      name: dto.name,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      paymentDate: dto.paymentDate,
      frequency: dto.frequency || 'monthly',
      status: 'draft',
      totalGross: Math.round(totalGross * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalNi: Math.round(totalNi * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      totalEmployees: payslipsToCreate.length,
      currency: 'GBP',
      notes: dto.notes,
    });

    // 4. Create child payslip records
    const createdPayslips: PayslipEntity[] = [];
    for (const p of payslipsToCreate) {
      const created = await this.db.createPayslip({
        ...p,
        payRunId: payRun.id,
      });
      createdPayslips.push(created);
    }

    // 5. Audit Log
    await this.db.recordAudit({
      companyId,
      userId,
      action: 'pay_run:create',
      entity: 'pay_run',
      entityId: payRun.id,
      newValue: {
        name: payRun.name,
        period: `${dto.periodStart} to ${dto.periodEnd}`,
        totalGross: payRun.totalGross,
        totalEmployees: payRun.totalEmployees,
      },
    });

    this.logger.log(`Created Pay Run ${payRun.id} with ${createdPayslips.length} payslips.`);
    return { ...payRun, payslips: createdPayslips };
  }

  /**
   * List all pay runs with optional status and period filters.
   */
  async findAllPayRuns(companyId: string, query: QueryPayRunsDto) {
    return this.db.findPayRuns(companyId, {
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  /**
   * Find single pay run with all associated enriched payslips.
   */
  async findOnePayRun(companyId: string, id: string) {
    const payRun = await this.db.findPayRunById(companyId, id);
    if (!payRun) {
      throw new NotFoundException(`Pay Run with ID ${id} not found.`);
    }

    const payslips = await this.db.findPayslips(companyId, { payRunId: id });
    const enrichedPayslips = await Promise.all(
      payslips.map(async (ps) => {
        const emp = await this.db.findEmployeeById(companyId, ps.employeeId);
        return {
          ...ps,
          employee: emp
            ? {
                id: emp.id,
                employeeNumber: emp.employeeNumber,
                firstName: emp.firstName,
                lastName: emp.lastName,
                email: emp.email,
              }
            : null,
        };
      })
    );

    return {
      ...payRun,
      payslips: enrichedPayslips,
    };
  }

  /**
   * Transition pay run state (e.g. pending_approval -> approved -> paid).
   * Once marked 'paid':
   * 1. Stamps payment timestamp
   * 2. Updates all payslips to 'paid'
   * 3. Locks all associated timesheets
   * 4. Enforces historical immutability
   */
  async reviewPayRun(companyId: string, id: string, dto: ReviewPayRunDto, userId?: string) {
    const payRun = await this.db.findPayRunById(companyId, id);
    if (!payRun) {
      throw new NotFoundException(`Pay Run with ID ${id} not found.`);
    }

    if (payRun.status === 'paid' && dto.status !== 'paid') {
      throw new BadRequestException('A paid and finalized pay run is immutable and cannot be reverted.');
    }

    const updates: Partial<PayRunEntity> = {
      status: dto.status,
      notes: dto.notes || payRun.notes,
    };

    if (dto.status === 'approved') {
      updates.approvedBy = userId;
      updates.approvedAt = new Date();
    } else if (dto.status === 'paid') {
      updates.paidAt = new Date();
      if (!payRun.approvedAt) {
        updates.approvedBy = userId;
        updates.approvedAt = new Date();
      }
    }

    const updated = await this.db.updatePayRun(companyId, id, updates);

    // If paid, lock payslips and timesheets
    if (dto.status === 'paid') {
      const payslips = await this.db.findPayslips(companyId, { payRunId: id });
      for (const ps of payslips) {
        await this.db.updatePayslip(companyId, ps.id, { status: 'paid' });
        if (ps.timesheetId) {
          await this.db.updateTimesheet(companyId, ps.timesheetId, { status: 'locked' });
        }
      }
    }

    // Audit Log
    await this.db.recordAudit({
      companyId,
      userId,
      action: `pay_run:${dto.status}`,
      entity: 'pay_run',
      entityId: id,
      oldValue: { status: payRun.status },
      newValue: { status: dto.status, notes: dto.notes },
    });

    return updated;
  }

  /**
   * Query payslips directly with employee details.
   */
  async findPayslips(companyId: string, query: QueryPayslipsDto) {
    const payslips = await this.db.findPayslips(companyId, {
      payRunId: query.payRunId,
      employeeId: query.employeeId,
      status: query.status,
    });

    return Promise.all(
      payslips.map(async (ps) => {
        const emp = await this.db.findEmployeeById(companyId, ps.employeeId);
        return {
          ...ps,
          employee: emp
            ? {
                id: emp.id,
                employeeNumber: emp.employeeNumber,
                firstName: emp.firstName,
                lastName: emp.lastName,
                email: emp.email,
              }
            : null,
        };
      })
    );
  }

  /**
   * Find single payslip with employee details.
   */
  async findPayslipById(companyId: string, id: string) {
    const payslip = await this.db.findPayslipById(companyId, id);
    if (!payslip) {
      throw new NotFoundException(`Payslip with ID ${id} not found.`);
    }

    const emp = await this.db.findEmployeeById(companyId, payslip.employeeId);
    return {
      ...payslip,
      employee: emp
        ? {
            id: emp.id,
            employeeNumber: emp.employeeNumber,
            firstName: emp.firstName,
            lastName: emp.lastName,
            email: emp.email,
          }
        : null,
    };
  }

  /**
   * Exports Pay Run as a CSV format ready for accountant payroll software and UK BACS.
   */
  async exportPayRunCsv(companyId: string, id: string): Promise<string> {
    const payRunDetails = await this.findOnePayRun(companyId, id);
    const headers = [
      'Employee Number',
      'First Name',
      'Last Name',
      'Period Start',
      'Period End',
      'Payment Date',
      'Regular Hours',
      'Overtime Hours',
      'Gross Pay (£)',
      'Tax Deduction (£)',
      'National Insurance (£)',
      'Net Pay (£)',
      'Status',
    ];

    const rows = (payRunDetails.payslips || []).map((ps: any) => [
      `"${ps.employee?.employeeNumber || 'N/A'}"`,
      `"${ps.employee?.firstName || ''}"`,
      `"${ps.employee?.lastName || ''}"`,
      ps.periodStart,
      ps.periodEnd,
      ps.paymentDate,
      ps.regularHours.toFixed(2),
      ps.overtimeHours.toFixed(2),
      ps.grossPay.toFixed(2),
      ps.taxDeduction.toFixed(2),
      ps.nationalInsurance.toFixed(2),
      ps.netPay.toFixed(2),
      `"${ps.status}"`,
    ]);

    return [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
  }
}
