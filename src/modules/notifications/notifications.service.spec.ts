import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { DatabaseService } from '../../database/database.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let db: DatabaseService;

  const mockCompanyId = '00000000-0000-0000-0000-000000000001';
  const mockUserId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, DatabaseService],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an in-app notification', async () => {
    const notification = await service.create(mockCompanyId, {
      userId: mockUserId,
      title: 'Shift Change Alert',
      message: 'Your shift has been updated.',
      type: 'shift_assigned',
      priority: 'normal',
      actionUrl: '/shifts',
    });

    expect(notification).toBeDefined();
    expect(notification.title).toBe('Shift Change Alert');
    expect(notification.status).toBe('unread');
    expect(notification.companyId).toBe(mockCompanyId);
  });

  it('should retrieve notifications with unread count', async () => {
    await service.create(mockCompanyId, {
      userId: mockUserId,
      title: 'Alert 1',
      message: 'Message 1',
      type: 'system',
    });

    const result = await service.findAll(mockCompanyId, mockUserId, {});
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.unreadCount).toBeGreaterThan(0);
  });

  it('should get unread notifications count', async () => {
    const count = await service.getUnreadCount(mockCompanyId, mockUserId);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('should mark a notification as read', async () => {
    const n = await service.create(mockCompanyId, {
      userId: mockUserId,
      title: 'To Read',
      message: 'Read me',
      type: 'system',
    });

    const updated = await service.markAsRead(mockCompanyId, n.id);
    expect(updated.status).toBe('read');
    expect(updated.readAt).toBeDefined();
  });

  it('should mark all notifications as read', async () => {
    await service.create(mockCompanyId, {
      userId: mockUserId,
      title: 'Unread 1',
      message: 'Unread message 1',
      type: 'system',
    });
    await service.create(mockCompanyId, {
      userId: mockUserId,
      title: 'Unread 2',
      message: 'Unread message 2',
      type: 'system',
    });

    const result = await service.markAllAsRead(mockCompanyId, mockUserId);
    expect(result.count).toBeGreaterThanOrEqual(2);

    const count = await service.getUnreadCount(mockCompanyId, mockUserId);
    expect(count).toBe(0);
  });

  it('should delete a notification', async () => {
    const n = await service.create(mockCompanyId, {
      userId: mockUserId,
      title: 'To Delete',
      message: 'Delete me',
      type: 'system',
    });

    const delResult = await service.delete(mockCompanyId, n.id);
    expect(delResult.success).toBe(true);
  });

  it('should notify leave decision correctly', async () => {
    await service.notifyLeaveDecision(
      mockCompanyId,
      'emp-123',
      'approved',
      'annual',
      '2026-10-01',
      '2026-10-03',
      'Approved by manager'
    );

    const result = await service.findAll(mockCompanyId, undefined, { type: 'leave_decision' });
    expect(result.items.some((i) => i.title.includes('APPROVED'))).toBe(true);
  });

  it('should notify shift assigned correctly', async () => {
    await service.notifyShiftAssigned(
      mockCompanyId,
      'emp-123',
      '2026-10-05',
      '08:00',
      '20:00',
      'Canary Wharf HQ',
      'Security Officer'
    );

    const result = await service.findAll(mockCompanyId, undefined, { type: 'shift_assigned' });
    expect(result.items.some((i) => i.title.includes('New Shift Assigned'))).toBe(true);
  });

  it('should scan licence expiries and create compliance alerts', async () => {
    const scanResult = await service.scanLicenceExpiries(mockCompanyId);
    expect(scanResult).toBeDefined();
    expect(typeof scanResult.scanned).toBe('number');
  });
});
