import { IsString, IsNotEmpty, IsOptional, IsEnum, IsObject, IsUUID } from 'class-validator';
import type { NotificationType, NotificationPriority } from '../../../database/database.service';

export class CreateNotificationDto {
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(['licence_expiry', 'shift_assigned', 'shift_reminder', 'leave_decision', 'account_event', 'compliance_alert', 'system'])
  type: NotificationType;

  @IsEnum(['low', 'normal', 'high', 'urgent'])
  @IsOptional()
  priority?: NotificationPriority;

  @IsString()
  @IsOptional()
  actionUrl?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
