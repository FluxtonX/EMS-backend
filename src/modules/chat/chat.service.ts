import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { DatabaseService, ChatConversationEntity, ChatMessageEntity } from '../../database/database.service';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export interface HydratedConversation extends ChatConversationEntity {
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    employmentStatus: string;
    currentSiteName?: string;
  };
  unreadCount: number;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * List conversations for company management or specific employee
   */
  async getConversations(companyId: string, user: AuthenticatedUser): Promise<HydratedConversation[]> {
    const isEmployee = user.role === Role.Employee;
    let employeeId: string | undefined = undefined;

    if (isEmployee) {
      const emp = await this.resolveEmployeeForUser(companyId, user.id);
      if (!emp) {
        return [];
      }
      employeeId = emp.id;
    }

    const conversations = await this.db.findChatConversations(companyId, employeeId);
    const hydrated: HydratedConversation[] = [];

    for (const conv of conversations) {
      const emp = await this.db.findEmployeeById(companyId, conv.employeeId);
      if (!emp) continue;

      // Determine active assignment for site name context
      const activeAssignment = await this.db.findActiveAssignmentByEmployeeId(companyId, emp.id);
      let currentSiteName: string | undefined;

      if (activeAssignment) {
        const siteJob = await this.db.findSiteJobById(companyId, activeAssignment.siteJobId);
        if (siteJob) {
          const site = await this.db.findSiteById(companyId, siteJob.siteId);
          currentSiteName = site?.name;
        }
      }

      // Calculate unread count for the viewer
      const viewerRole = isEmployee ? 'EMPLOYEE' : 'COMPANY';
      const messages = await this.db.findChatMessages(companyId, conv.id);
      const targetSenderRole = viewerRole === 'COMPANY' ? 'EMPLOYEE' : 'COMPANY';
      const unreadCount = messages.filter((m) => m.senderRole === targetSenderRole && !m.isRead).length;

      hydrated.push({
        ...conv,
        employee: {
          id: emp.id,
          employeeNumber: emp.employeeNumber,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          phone: emp.phone,
          employmentStatus: emp.employmentStatus,
          currentSiteName,
        },
        unreadCount,
      });
    }

    return hydrated;
  }

  /**
   * Get or create conversation between company and an employee
   */
  async getOrCreateConversation(
    companyId: string,
    user: AuthenticatedUser,
    targetEmployeeId?: string
  ): Promise<HydratedConversation> {
    const isEmployee = user.role === Role.Employee;
    let employeeId = targetEmployeeId;

    if (isEmployee) {
      const emp = await this.resolveEmployeeForUser(companyId, user.id);
      if (!emp) {
        throw new NotFoundException('Employee record not found for active user identity.');
      }
      employeeId = emp.id;
    } else if (!employeeId) {
      throw new ForbiddenException('Employee ID is required to start a conversation as company staff.');
    }

    // Verify employee exists in company
    const emp = await this.db.findEmployeeById(companyId, employeeId);
    if (!emp) {
      throw new NotFoundException(`Employee '${employeeId}' not found.`);
    }

    let conv = await this.db.findChatConversationByEmployee(companyId, employeeId);
    if (!conv) {
      conv = await this.db.createChatConversation({
        companyId,
        employeeId,
        createdBy: user.id,
        lastMessagePreview: 'Conversation started',
      });
    }

    const conversations = await this.getConversations(companyId, user);
    const found = conversations.find((c) => c.id === conv?.id);
    if (found) return found;

    return {
      ...conv,
      employee: {
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        phone: emp.phone,
        employmentStatus: emp.employmentStatus,
      },
      unreadCount: 0,
    };
  }

  /**
   * Get message history for a conversation with authorization check
   */
  async getMessages(
    companyId: string,
    user: AuthenticatedUser,
    conversationId: string
  ): Promise<ChatMessageEntity[]> {
    const conv = await this.db.findChatConversationById(companyId, conversationId);
    if (!conv) {
      throw new NotFoundException('Conversation not found.');
    }

    // If viewer is an employee, verify they own this conversation
    if (user.role === Role.Employee) {
      const emp = await this.resolveEmployeeForUser(companyId, user.id);
      if (!emp || emp.id !== conv.employeeId) {
        throw new ForbiddenException('You are not authorized to view this conversation.');
      }
    }

    return this.db.findChatMessages(companyId, conversationId);
  }

  /**
   * Send a message and update conversation preview
   */
  async sendMessage(
    companyId: string,
    user: AuthenticatedUser,
    conversationId: string,
    content: string
  ): Promise<ChatMessageEntity> {
    const conv = await this.db.findChatConversationById(companyId, conversationId);
    if (!conv) {
      throw new NotFoundException('Conversation not found.');
    }

    const isEmployee = user.role === Role.Employee;
    let senderRole: 'COMPANY' | 'EMPLOYEE' = 'COMPANY';
    let senderName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Staff';

    if (isEmployee) {
      const emp = await this.resolveEmployeeForUser(companyId, user.id);
      if (!emp || emp.id !== conv.employeeId) {
        throw new ForbiddenException('You are not authorized to message in this conversation.');
      }
      senderRole = 'EMPLOYEE';
      senderName = `${emp.firstName} ${emp.lastName}`.trim();
    }

    const message = await this.db.createChatMessage({
      conversationId,
      companyId,
      senderId: user.id,
      senderRole,
      senderName,
      content: content.trim(),
    });

    this.logger.log(`[CHAT DISPATCH] Message sent in ${conversationId} by ${senderRole} (${senderName})`);
    return message;
  }

  /**
   * Mark all unread incoming messages as read
   */
  async markAsRead(
    companyId: string,
    user: AuthenticatedUser,
    conversationId: string
  ): Promise<{ success: boolean }> {
    const conv = await this.db.findChatConversationById(companyId, conversationId);
    if (!conv) {
      throw new NotFoundException('Conversation not found.');
    }

    const isEmployee = user.role === Role.Employee;
    const readerRole = isEmployee ? 'EMPLOYEE' : 'COMPANY';
    await this.db.markChatMessagesAsRead(companyId, conversationId, readerRole);
    return { success: true };
  }

  /**
   * Unread badge counter for header / sidebar
   */
  async getUnreadCount(companyId: string, user: AuthenticatedUser): Promise<{ unreadCount: number }> {
    const isEmployee = user.role === Role.Employee;
    let employeeId: string | undefined = undefined;

    if (isEmployee) {
      const emp = await this.resolveEmployeeForUser(companyId, user.id);
      if (!emp) return { unreadCount: 0 };
      employeeId = emp.id;
    }

    const count = await this.db.getUnreadChatCount(companyId, isEmployee ? 'EMPLOYEE' : 'COMPANY', employeeId);
    return { unreadCount: count };
  }

  private async resolveEmployeeForUser(companyId: string, userId: string) {
    const byUserId = await this.db.findEmployeeByUserId(companyId, userId);
    if (byUserId) return byUserId;

    const user = await this.db.findUserById(userId);
    if (user) {
      const searchResult = await this.db.findEmployees(companyId, { search: user.email });
      return searchResult.items.find((e) => e.email.toLowerCase() === user.email.toLowerCase()) || null;
    }
    return null;
  }
}
