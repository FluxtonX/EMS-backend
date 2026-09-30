import { Test, TestingModule } from '@nestjs/testing';
import { TimesheetsService } from './timesheets.service';
import { DatabaseService } from '../../database/database.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('TimesheetsService', () => {
  let service: TimesheetsService;
  let db: DatabaseService;

  const mockCompanyId = '00000000-0000-0000-0000-000000000001';
  const mockSupervisorId = 'user-supervisor-01';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimesheetsService,
        {
          provide: DatabaseService,
          useValue: {
            findEmployees: jest.fn().mockResolvedValue({
              items: [
                {
                  id: 'emp-1',
                  employeeNumber: 'EMP-001',
                  firstName: 'John',
                  lastName: 'Doe',
                  email: 'john@example.com',
                },
              ],
              total: 1,
            }),
            findEmployeeById: jest.fn().mockImplementation((cId, empId) => {
              if (empId === 'emp-1') {
                return Promise.resolve({
                  id: 'emp-1',
                  employeeNumber: 'EMP-001',
                  firstName: 'John',
                  lastName: 'Doe',
                  email: 'john@example.com',
                });
              }
              return Promise.resolve(null);
            }),
            findAttendanceRecords: jest.fn().mockResolvedValue([
              {
                id: 'att-1',
                companyId: mockCompanyId,
                employeeId: 'emp-1',
                siteId: 'site-1',
                clockInTime: new Date('2026-09-01T08:00:00Z'),
                clockOutTime: new Date('2026-09-01T17:00:00Z'), // 9 hours
                breakMinutes: 60, // 1 hour break -> 8 net hours
                status: 'reconciled',
              },
            ]),
            findAssignmentsByEmployeeId: jest.fn().mockResolvedValue([
              {
                id: 'asgn-1',
                employeeId: 'emp-1',
                siteId: 'site-1',
                chargeRate: 25.0,
                payRate: 15.0,
                startDate: '2026-01-01',
                status: 'active',
              },
            ]),
            findTimesheetById: jest.fn(),
            findTimesheets: jest.fn().mockResolvedValue([]),
            createTimesheet: jest.fn().mockImplementation((cId, data) =>
              Promise.resolve({
                id: 'ts-1',
                companyId: cId,
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            ),
            createTimesheetEntry: jest.fn().mockImplementation((tsId, data) =>
              Promise.resolve({
                id: 'entry-1',
                timesheetId: tsId,
                ...data,
                createdAt: new Date(),
              })
            ),
            findTimesheetEntries: jest.fn(),
            updateTimesheetEntry: jest.fn(),
            updateTimesheet: jest.fn(),
            recordAudit: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<TimesheetsService>(TimesheetsService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTimesheets', () => {
    it('should deduct unpaid break and snapshot pay rate', async () => {
      const result = await service.generateTimesheets(mockCompanyId, {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-07',
        employeeId: 'emp-1',
      });

      expect(result.generated).toBe(1);
      expect(db.createTimesheet).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: mockCompanyId,
          employeeId: 'emp-1',
          totalHours: 8, // 9h gross - 1h break = 8h net
          regularHours: 8,
          overtimeHours: 0,
          grossPay: 120, // 8h * £15.00
          status: 'draft',
        })
      );
      expect(db.createTimesheetEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          timesheetId: 'ts-1',
          grossHours: 9,
          breakMinutes: 60,
          netHours: 8,
          payRate: 15.0,
          totalPay: 120,
        })
      );
    });
  });

  describe('adjustEntry', () => {
    it('should adjust entry minutes and record security audit log', async () => {
      const mockTimesheet = {
        id: 'ts-1',
        companyId: mockCompanyId,
        status: 'draft',
        totalHours: 8,
        grossPay: 120,
      };
      const mockEntry = {
        id: 'entry-1',
        timesheetId: 'ts-1',
        netHours: 8,
        payRate: 15.0,
        totalPay: 120,
        adjustmentMinutes: 0,
      };

      jest.spyOn(db, 'findTimesheetById').mockResolvedValue(mockTimesheet as any);
      jest.spyOn(db, 'findTimesheetEntries').mockResolvedValue([mockEntry as any]);
      jest.spyOn(db, 'updateTimesheetEntry').mockResolvedValue({
        ...mockEntry,
        netHours: 9,
        adjustmentMinutes: 60,
      } as any);
      jest.spyOn(db, 'updateTimesheet').mockResolvedValue({} as any);

      const adjusted = await service.adjustEntry(
        mockCompanyId,
        'ts-1',
        'entry-1',
        {
          adjustmentMinutes: 60, // +1 hour
          adjustmentReason: 'Approved extra security patrol by operations director',
        },
        mockSupervisorId
      );

      expect(adjusted.adjustmentMinutes).toBe(60);
      expect(db.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'timesheet:adjust_hours',
          entity: 'timesheet_entry',
          entityId: 'entry-1',
          userId: mockSupervisorId,
        })
      );
    });

    it('should throw BadRequestException if timesheet is locked', async () => {
      jest.spyOn(db, 'findTimesheetById').mockResolvedValue({
        id: 'ts-1',
        companyId: mockCompanyId,
        status: 'locked',
      } as any);

      await expect(
        service.adjustEntry(
          mockCompanyId,
          'ts-1',
          'entry-1',
          { adjustmentMinutes: 30, adjustmentReason: 'Late finish' },
          mockSupervisorId
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('review', () => {
    it('should transition status to approved and record audit', async () => {
      jest.spyOn(db, 'findTimesheetById').mockResolvedValue({
        id: 'ts-1',
        companyId: mockCompanyId,
        status: 'submitted',
      } as any);
      jest.spyOn(db, 'updateTimesheet').mockResolvedValue({
        id: 'ts-1',
        status: 'approved',
      } as any);

      const result = await service.review(
        mockCompanyId,
        'ts-1',
        { status: 'approved', notes: 'Verified against access control' },
        mockSupervisorId
      );

      expect(result.status).toBe('approved');
      expect(db.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'timesheet:approved',
          entity: 'timesheet',
          entityId: 'ts-1',
        })
      );
    });

    it('should prevent reopening a locked timesheet', async () => {
      jest.spyOn(db, 'findTimesheetById').mockResolvedValue({
        id: 'ts-1',
        companyId: mockCompanyId,
        status: 'locked',
      } as any);

      await expect(
        service.review(
          mockCompanyId,
          'ts-1',
          { status: 'approved' },
          mockSupervisorId
        )
      ).rejects.toThrow(BadRequestException);
    });
  });
});
