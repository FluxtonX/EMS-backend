import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { DatabaseService } from '../../database/database.service';

const mockDb = {
  findEmployeeById: jest.fn(),
  findLeaveRequests: jest.fn(),
  findLeaveRequestById: jest.fn(),
  createLeaveRequest: jest.fn(),
  updateLeaveRequest: jest.fn(),
  cancelLeaveRequest: jest.fn(),
};

const mockEmployee = {
  id: 'emp-1',
  companyId: 'co-1',
  firstName: 'Alice',
  lastName: 'Smith',
  employmentStatus: 'active',
};

const mockLeave = {
  id: 'leave-1',
  companyId: 'co-1',
  employeeId: 'emp-1',
  leaveType: 'annual' as const,
  startDate: '2026-11-01',
  endDate: '2026-11-05',
  totalDays: 5,
  status: 'pending' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('LeaveService', () => {
  let service: LeaveService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<LeaveService>(LeaveService);
  });

  describe('createLeaveRequest', () => {
    it('should create a leave request successfully', async () => {
      mockDb.findEmployeeById.mockResolvedValue(mockEmployee);
      mockDb.findLeaveRequests.mockResolvedValue([]);
      mockDb.createLeaveRequest.mockResolvedValue(mockLeave);

      const result = await service.createLeaveRequest(
        'co-1',
        {
          employeeId: 'emp-1',
          leaveType: 'annual',
          startDate: '2026-11-01',
          endDate: '2026-11-05',
          reason: 'Holiday',
        },
        'user-1'
      );

      expect(result).toEqual(mockLeave);
      expect(mockDb.createLeaveRequest).toHaveBeenCalledWith(
        'co-1',
        expect.objectContaining({ employeeId: 'emp-1' })
      );
    });

    it('should throw NotFoundException if employee not found', async () => {
      mockDb.findEmployeeById.mockResolvedValue(null);
      await expect(
        service.createLeaveRequest('co-1', { employeeId: 'bad', leaveType: 'annual', startDate: '2026-11-01', endDate: '2026-11-05' }, 'user-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if terminated employee', async () => {
      mockDb.findEmployeeById.mockResolvedValue({ ...mockEmployee, employmentStatus: 'terminated' });
      await expect(
        service.createLeaveRequest('co-1', { employeeId: 'emp-1', leaveType: 'annual', startDate: '2026-11-01', endDate: '2026-11-05' }, 'user-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if end date before start date', async () => {
      mockDb.findEmployeeById.mockResolvedValue(mockEmployee);
      mockDb.findLeaveRequests.mockResolvedValue([]);
      await expect(
        service.createLeaveRequest('co-1', { employeeId: 'emp-1', leaveType: 'annual', startDate: '2026-11-10', endDate: '2026-11-01' }, 'user-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on overlapping leave', async () => {
      mockDb.findEmployeeById.mockResolvedValue(mockEmployee);
      mockDb.findLeaveRequests.mockResolvedValue([{ ...mockLeave, employee: mockEmployee }]);

      await expect(
        service.createLeaveRequest(
          'co-1',
          { employeeId: 'emp-1', leaveType: 'annual', startDate: '2026-11-03', endDate: '2026-11-07' },
          'user-1'
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reviewLeaveRequest', () => {
    it('should approve a pending leave request', async () => {
      mockDb.findLeaveRequestById.mockResolvedValue(mockLeave);
      const approved = { ...mockLeave, status: 'approved', reviewedBy: 'user-2' };
      mockDb.updateLeaveRequest.mockResolvedValue(approved);

      const result = await service.reviewLeaveRequest('co-1', 'leave-1', { status: 'approved' }, 'user-2');
      expect(result.status).toBe('approved');
      expect(mockDb.updateLeaveRequest).toHaveBeenCalledWith(
        'co-1',
        'leave-1',
        expect.objectContaining({ status: 'approved', reviewedBy: 'user-2' })
      );
    });

    it('should throw BadRequestException when reviewing non-pending leave', async () => {
      mockDb.findLeaveRequestById.mockResolvedValue({ ...mockLeave, status: 'approved' });
      await expect(
        service.reviewLeaveRequest('co-1', 'leave-1', { status: 'rejected' }, 'user-2')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelLeaveRequest', () => {
    it('should cancel a pending leave request', async () => {
      mockDb.findLeaveRequestById.mockResolvedValue(mockLeave);
      mockDb.cancelLeaveRequest.mockResolvedValue({ ...mockLeave, status: 'cancelled' });

      const result = await service.cancelLeaveRequest('co-1', 'leave-1');
      expect(result.status).toBe('cancelled');
    });

    it('should throw BadRequestException when already cancelled', async () => {
      mockDb.findLeaveRequestById.mockResolvedValue({ ...mockLeave, status: 'cancelled' });
      await expect(service.cancelLeaveRequest('co-1', 'leave-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getLeaveStats', () => {
    it('should compute correct stats', async () => {
      const thisYear = new Date().getFullYear();
      mockDb.findLeaveRequests.mockResolvedValue([
        { ...mockLeave, startDate: `${thisYear}-02-01`, status: 'approved', totalDays: 3, employee: mockEmployee },
        { ...mockLeave, id: 'leave-2', startDate: `${thisYear}-05-01`, status: 'pending', totalDays: 2, employee: mockEmployee },
      ]);

      const stats = await service.getLeaveStats('co-1', 'emp-1');
      expect(stats.daysUsedThisYear).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.approved).toBe(1);
    });
  });
});
