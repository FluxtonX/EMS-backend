import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.chatService.getConversations(companyId, user);
  }

  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  async getOrCreateConversation(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Partial<CreateConversationDto>
  ) {
    return this.chatService.getOrCreateConversation(companyId, user, dto.employeeId);
  }

  @Get('by-employee/:employeeId')
  async getOrCreateConversationByParam(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string
  ) {
    return this.chatService.getOrCreateConversation(companyId, user, employeeId);
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string
  ) {
    return this.chatService.getMessages(companyId, user, conversationId);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto
  ) {
    const text = (dto.content || dto.text || '').trim();
    if (!text) {
      throw new BadRequestException('Message content cannot be empty');
    }
    return this.chatService.sendMessage(companyId, user, conversationId, text);
  }


  @Patch('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string
  ) {
    return this.chatService.markAsRead(companyId, user, conversationId);
  }

  @Get('unread-count')
  async getUnreadCount(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.chatService.getUnreadCount(companyId, user);
  }
}
