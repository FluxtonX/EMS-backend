import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService, calculateDistanceMeters } from './attendance.service';
import { DatabaseService } from '../../database/database.service';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let db: DatabaseService;

  const mockCompanyId = '00000000-0000-0000-0000-000000000001';
  let mockEmployeeId: string;
  let mockSiteId: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AttendanceService, DatabaseService],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    db = module.get<DatabaseService>(DatabaseService);

    // Setup base fixtures
    const employee = await db.createEmployee({
      companyId: mockCompanyId,
      employeeNumber: 'EMP-ATTEND-01',
      firstName: 'Sarah',
      lastName: 'Connor',
      email: 'sarah.connor@sky.net',
      phone: '+447000999888',
      dateOfBirth: '1985-11-28',
      address: { line1: 'Cyberdyne Way', city: 'London', postalCode: 'EC1A 1BB', country: 'UK' },
      emergencyContact: { name: 'John Connor', relationship: 'Son', phone: '+447000111999' },
      employmentStatus: 'active',
      employmentStartDate: '2025-01-01',
    });
    mockEmployeeId = employee.id;

    // Create Site with known GPS coordinates (Canary Wharf, London: 51.5049, -0.0195)
    const site = await db.createSite({
      companyId: mockCompanyId,
      name: 'Canary Wharf Tower One',
      code: 'CWT-01',
      address: { line1: '1 Canada Square', city: 'London', postalCode: 'E14 5AA', country: 'UK' },
      status: 'active',
    });

    // Update with GPS coordinates & 200m geofence radius
    await db.updateSite(mockCompanyId, site.id, {
      ...site,
      latitude: 51.5049,
      longitude: -0.0195,
      geofenceRadius: 200,
    });
    mockSiteId = site.id;
  });

  describe('Haversine Formula', () => {
    it('should accurately calculate distance between coordinates', () => {
      // Point A: Canary Wharf (51.5049, -0.0195)
      // Point B: 50 meters away (51.5052, -0.0195)
      const distMeters = calculateDistanceMeters(51.5049, -0.0195, 51.5052, -0.0195);
      expect(distMeters).toBeGreaterThan(25);
      expect(distMeters).toBeLessThan(45);
    });
  });

  describe('Clock In Workflow & Geofencing', () => {
    it('should clock in successfully within geofence radius', async () => {
      // Guard is 30m away from site coordinates
      const record = await service.clockIn(
        mockCompanyId,
        {
          employeeId: mockEmployeeId,
          siteId: mockSiteId,
          latitude: 51.5051,
          longitude: -0.0195,
          accuracy: 5.0,
        },
        'user-id'
      );

      expect(record).toBeDefined();
      expect(record.status).toBe('clocked_in');
      expect(record.clockInVerified).toBe(true);
      expect(record.varianceFlag).toBe('none');
      expect(record.clockInDistance).toBeDefined();
      expect(record.clockInDistance).toBeLessThan(200);
    });

    it('should flag clock-in as out_of_geofence if guard is outside radius', async () => {
      // Guard is at London Bridge (51.5079, -0.0877), ~5km away from Canary Wharf
      const record = await service.clockIn(mockCompanyId, {
        employeeId: mockEmployeeId,
        siteId: mockSiteId,
        latitude: 51.5079,
        longitude: -0.0877,
        accuracy: 10.0,
      });

      expect(record.status).toBe('clocked_in');
      expect(record.clockInVerified).toBe(false);
      expect(record.varianceFlag).toBe('out_of_geofence');
      expect(record.clockInDistance).toBeGreaterThan(4000);
    });

    it('should reject clock-in if employee is already clocked in', async () => {
      await service.clockIn(mockCompanyId, {
        employeeId: mockEmployeeId,
        siteId: mockSiteId,
      });

      await expect(
        service.clockIn(mockCompanyId, {
          employeeId: mockEmployeeId,
          siteId: mockSiteId,
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Break Management & Clock Out', () => {
    it('should transition to on_break and back to clocked_in with accumulated break minutes', async () => {
      const record = await service.clockIn(mockCompanyId, {
        employeeId: mockEmployeeId,
        siteId: mockSiteId,
      });

      // Start break
      const onBreak = await service.startBreak(mockCompanyId, record.id, 'user-id');
      expect(onBreak?.status).toBe('on_break');
      expect(onBreak?.breakStartTime).toBeDefined();

      // End break
      const backOnDuty = await service.endBreak(mockCompanyId, record.id, 'user-id');
      expect(backOnDuty?.status).toBe('clocked_in');
      expect(backOnDuty?.breakEndTime).toBeDefined();
    });

    it('should clock out and calculate total net hours', async () => {
      const record = await service.clockIn(mockCompanyId, {
        employeeId: mockEmployeeId,
        siteId: mockSiteId,
      });

      // Fast clock-out
      const clockedOut = await service.clockOut(
        mockCompanyId,
        record.id,
        {
          latitude: 51.5049,
          longitude: -0.0195,
        },
        'user-id'
      );

      expect(clockedOut.status).toBe('clocked_out');
      expect(clockedOut.clockOutTime).toBeDefined();
      expect(clockedOut.clockOutVerified).toBe(true);
      expect(clockedOut.totalHours).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Supervisor Reconciliation', () => {
    it('should allow supervisor to adjust hours and reconcile variance with audit note', async () => {
      // Clock in out-of-geofence
      const record = await service.clockIn(mockCompanyId, {
        employeeId: mockEmployeeId,
        siteId: mockSiteId,
        latitude: 52.0, // far away
        longitude: 0.0,
      });

      const clockedOut = await service.clockOut(mockCompanyId, record.id, {});

      // Supervisor reconciles
      const reconciled = await service.reconcile(
        mockCompanyId,
        clockedOut.id,
        {
          status: 'reconciled',
          adjustedTotalHours: 8.0,
          adjustedBreakMinutes: 30,
          varianceFlag: 'none',
          supervisorNotes: 'Guard was on perimeter patrol at external warehouse. Verified with CCTV.',
        },
        'supervisor-user-id'
      );

      expect(reconciled.status).toBe('reconciled');
      expect(reconciled.totalHours).toBe(8.0);
      expect(reconciled.breakMinutes).toBe(30);
      expect(reconciled.varianceFlag).toBe('none');
      expect(reconciled.supervisorNotes).toContain('perimeter patrol');
      expect(reconciled.reconciledBy).toBe('supervisor-user-id');
    });
  });
});
