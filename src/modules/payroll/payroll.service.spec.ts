import { Test, TestingModule } from '@nestjs/testing';
import { PayrollService, calculateUKDeductions } from './payroll.service';
import { DatabaseService } from '../../database/database.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PayrollService', () => {
  let service: PayrollService;
  let db: DatabaseService;

  const mockCompanyId = '00000000-0000-0000-0000-000000000001';
  const mockUserId = 'user-finance-01';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        {
          provide: DatabaseService,
          useValue: {
            findTimesheets: jest.fn().mockResolvedValue([
              {
                id: 'ts-101',
                companyId: mockCompanyId,
                employeeId: 'emp-101',
                periodStart: '2026-09-01',
                periodEnd: '2026-09-30',
                totalHours: 160.0,
                regularHours: 160.0,
                overtimeHours: 0.0,
                grossPay: 2400.0,
                currency: 'GBP',
                status: 'approved',
              },
            ]),
            findEmployees: jest.fn().mockResolvedValue({ items: [], total: 0 }),
            findEmployeeById: jest.fn().mockResolvedValue({
              id: 'emp-101',
              employeeNumber: 'EMP-00101',
              firstName: 'Arthur',
              lastName: 'Pendleton',
              email: 'arthur@example.com',
            }),
            createPayRun: jest.fn().mockImplementation((data) =>
              Promise.resolve({
                id: 'pr-101',
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            ),
            createPayslip: jest.fn().mockImplementation((data) =>
              Promise.resolve({
                id: 'ps-101',
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            ),
            findPayRuns: jest.fn(),
            findPayRunById: jest.fn(),
            updatePayRun: jest.fn(),
            findPayslips: jest.fn(),
            findPayslipById: jest.fn(),
            updatePayslip: jest.fn(),
            updateTimesheet: jest.fn(),
            recordAudit: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateUKDeductions', () => {
    it('should accurately calculate UK basic tax and employee NI on £2,400 monthly pay', () => {
      const { taxDeduction, nationalInsurance, netPay } = calculateUKDeductions(2400, 'monthly');
      // Taxable: 2400 - 1047.50 = 1352.50. Tax @ 20% = £270.50
      expect(taxDeduction).toBeCloseTo(270.5, 1);
      // NI: 2400 - 1048 = 1352. NI @ 8% = £108.16
      expect(nationalInsurance).toBeCloseTo(108.16, 1);
      // Net pay: 2400 - 270.50 - 108.16 = £2021.34
      expect(netPay).toBeCloseTo(2021.34, 1);
    });
  });

  describe('createPayRun', () => {
    it('should generate pay run and payslips from approved timesheets', async () => {
      const result = await service.createPayRun(
        mockCompanyId,
        {
          name: 'September 2026 Monthly Payroll',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          paymentDate: '2026-09-30',
          frequency: 'monthly',
        },
        mockUserId
      );

      expect(db.createPayRun).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: mockCompanyId,
          totalGross: 2400.0,
          totalEmployees: 1,
          status: 'draft',
        })
      );
      expect(db.createPayslip).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-101',
          grossPay: 2400.0,
          status: 'draft',
        })
      );
      expect(result.payslips).toHaveLength(1);
    });
  });

  describe('reviewPayRun', () => {
    it('should transition pay run to paid and lock child payslips and timesheets', async () => {
      const mockPayRun = {
        id: 'pr-101',
        companyId: mockCompanyId,
        status: 'approved',
      };
      const mockPayslips = [
        {
          id: 'ps-101',
          payRunId: 'pr-101',
          timesheetId: 'ts-101',
          status: 'draft',
        },
      ];

      jest.spyOn(db, 'findPayRunById').mockResolvedValue(mockPayRun as any);
      jest.spyOn(db, 'updatePayRun').mockResolvedValue({ ...mockPayRun, status: 'paid' } as any);
      jest.spyOn(db, 'findPayslips').mockResolvedValue(mockPayslips as any);

      const updated = await service.reviewPayRun(
        mockCompanyId,
        'pr-101',
        { status: 'paid' },
        mockUserId
      );

      expect(updated.status).toBe('paid');
      expect(db.updatePayslip).toHaveBeenCalledWith(mockCompanyId, 'ps-101', { status: 'paid' });
      expect(db.updateTimesheet).toHaveBeenCalledWith(mockCompanyId, 'ts-101', { status: 'locked' });
      expect(db.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'pay_run:paid',
          entity: 'pay_run',
          entityId: 'pr-101',
        })
      );
    });

    it('should prevent modifying a paid and finalized pay run', async () => {
      jest.spyOn(db, 'findPayRunById').mockResolvedValue({
        id: 'pr-101',
        companyId: mockCompanyId,
        status: 'paid',
      } as any);

      await expect(
        service.reviewPayRun(
          mockCompanyId,
          'pr-101',
          { status: 'draft' },
          mockUserId
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exportPayRunCsv', () => {
    it('should output a CSV containing headers and employee payroll details', async () => {
      jest.spyOn(service, 'findOnePayRun').mockResolvedValue({
        id: 'pr-101',
        payslips: [
          {
            id: 'ps-101',
            periodStart: '2026-09-01',
            periodEnd: '2026-09-30',
            paymentDate: '2026-09-30',
            regularHours: 160.0,
            overtimeHours: 0.0,
            grossPay: 2400.0,
            taxDeduction: 270.5,
            nationalInsurance: 108.16,
            netPay: 2021.34,
            status: 'paid',
            employee: {
              employeeNumber: 'EMP-00101',
              firstName: 'Arthur',
              lastName: 'Pendleton',
            },
          },
        ],
      } as any);

      const csv = await service.exportPayRunCsv(mockCompanyId, 'pr-101');
      expect(csv).toContain('Employee Number');
      expect(csv).toContain('EMP-00101');
      expect(csv).toContain('2400.00');
      expect(csv).toContain('2021.34');
    });
  });
});
