import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { DatabaseModule } from '../../database/database.module';
import { DatabaseService } from '../../database/database.service';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('ChatModule (Real-Time Company & Employee Messaging)', () => {
  let service: ChatService;
  let controller: ChatController;
  let db: DatabaseService;

  const companyId = 'test-company-101';
  const ownerUser: AuthenticatedUser = {
    id: 'user-owner-1',
    email: 'owner@company.co.uk',
    firstName: 'Alice',
    lastName: 'Director',
    companyId,
    role: Role.Owner,
  };

  const employeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    email: 'guard.sam@company.co.uk',
    firstName: 'Sam',
    lastName: 'Guard',
    companyId,
    role: Role.Employee,
  };

  let employeeId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      controllers: [ChatController],
      providers: [ChatService],
    }).compile();

    service = module.get<ChatService>(ChatService);
    controller = module.get<ChatController>(ChatController);
    db = module.get<DatabaseService>(DatabaseService);

    // Seed company, user, and employee record
    const comp = await db.createCompany({
      name: 'Security Corps',
      slug: `sec-corps-${Date.now()}`,
      status: 'active',
      subscriptionTier: 'standard',
    });
    const emp = await db.createEmployee({
      companyId: comp.id,
      userId: employeeUser.id,
      email: employeeUser.email,
      firstName: 'Sam',
      lastName: 'Guard',
      employeeNumber: 'EMP-SAM-01',
      phone: '+447000888999',
      dateOfBirth: '1992-05-14',
      employmentStartDate: '2026-01-01',
      employmentStatus: 'active',
      address: { line1: '1 Station Rd', city: 'London', postalCode: 'E1', country: 'UK' },
      emergencyContact: { name: 'Mary', relationship: 'Spouse', phone: '+447000' },
    });
    employeeId = emp.id;
    ownerUser.companyId = comp.id;
    employeeUser.companyId = comp.id;
  });

  it('should initialize or fetch conversation between company and employee', async () => {
    const conv = await controller.getOrCreateConversation(ownerUser.companyId, ownerUser, { employeeId });
    expect(conv).toBeDefined();
    expect(conv.id).toBeDefined();
    expect(conv.employeeId).toBe(employeeId);
    expect(conv.employee.firstName).toBe('Sam');
  });

  it('should allow Company to send message to Employee and persist in DB', async () => {
    const conv = await controller.getOrCreateConversation(ownerUser.companyId, ownerUser, { employeeId });
    const msg = await controller.sendMessage(ownerUser.companyId, ownerUser, conv.id, {
      content: 'Hello Sam, please confirm your attendance at Canary Wharf today.',
    });

    expect(msg).toBeDefined();
    expect(msg.content).toContain('Canary Wharf');
    expect(msg.senderRole).toBe('COMPANY');
    expect(msg.isRead).toBe(false);

    // Verify unread count for Employee is 1
    const unread = await controller.getUnreadCount(ownerUser.companyId, employeeUser);
    expect(unread.unreadCount).toBe(1);
  });

  it('should allow Employee to fetch messages and mark them as read', async () => {
    const conv = await controller.getOrCreateConversation(ownerUser.companyId, employeeUser, {});
    const messages = await controller.getMessages(ownerUser.companyId, employeeUser, conv.id);
    expect(messages.length).toBeGreaterThanOrEqual(1);

    await controller.markAsRead(ownerUser.companyId, employeeUser, conv.id);
    const unreadAfter = await controller.getUnreadCount(ownerUser.companyId, employeeUser);
    expect(unreadAfter.unreadCount).toBe(0);
  });

  it('should allow Employee to reply to Company', async () => {
    const conv = await controller.getOrCreateConversation(ownerUser.companyId, employeeUser, {});
    const reply = await controller.sendMessage(ownerUser.companyId, employeeUser, conv.id, {
      content: 'Received, I am on site and logged in via the geofence app.',
    });

    expect(reply.senderRole).toBe('EMPLOYEE');
    expect(reply.content).toContain('logged in');

    // Verify unread count for Company is now 1
    const companyUnread = await controller.getUnreadCount(ownerUser.companyId, ownerUser);
    expect(companyUnread.unreadCount).toBe(1);
  });
});
