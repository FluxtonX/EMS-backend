import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /api/v1/notifications
   * List notifications for the authenticated user and company.
   */
  @Get()
  @RequirePermissions(Permission.NOTIFICATION_VIEW)
  async findAll(
    @TenantId() companyId: string,
    @CurrentUser('id') userId: string,
    @Query() query: QueryNotificationsDto
  ) {
    return this.notificationsService.findAll(companyId, userId, query);
  }

  /**
   * GET /api/v1/notifications/unread-count
   * Fast count for the header bell badge.
   */
  @Get('unread-count')
  @RequirePermissions(Permission.NOTIFICATION_VIEW)
  async getUnreadCount(
    @TenantId() companyId: string,
    @CurrentUser('id') userId: string
  ) {
    const unreadCount = await this.notificationsService.getUnreadCount(companyId, userId);
    return { unreadCount };
  }

  /**
   * PATCH /api/v1/notifications/:id/read
   * Mark a single notification as read.
   */
  @Patch(':id/read')
  @RequirePermissions(Permission.NOTIFICATION_VIEW)
  async markAsRead(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.notificationsService.markAsRead(companyId, id);
  }

  /**
   * POST /api/v1/notifications/mark-all-read
   * Mark all unread notifications as read.
   */
  @Post('mark-all-read')
  @RequirePermissions(Permission.NOTIFICATION_VIEW)
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(
    @TenantId() companyId: string,
    @CurrentUser('id') userId: string
  ) {
    return this.notificationsService.markAllAsRead(companyId, userId);
  }

  /**
   * POST /api/v1/notifications/scan-licences
   * Trigger an automated licence expiry scan across the company.
   */
  @Post('scan-licences')
  @RequirePermissions(Permission.NOTIFICATION_MANAGE)
  @HttpCode(HttpStatus.OK)
  async scanLicences(@TenantId() companyId: string) {
    return this.notificationsService.scanLicenceExpiries(companyId);
  }

  /**
   * POST /api/v1/notifications/broadcast
   * Broadcast an alert or announcement to the workforce.
   */
  @Post('broadcast')
  @RequirePermissions(Permission.NOTIFICATION_MANAGE)
  async broadcast(
    @TenantId() companyId: string,
    @Body() dto: CreateNotificationDto
  ) {
    return this.notificationsService.create(companyId, dto);
  }

  /**
   * DELETE /api/v1/notifications/:id
   * Dismiss or delete a notification.
   */
  @Delete(':id')
  @RequirePermissions(Permission.NOTIFICATION_VIEW)
  async delete(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.notificationsService.delete(companyId, id);
  }
}
