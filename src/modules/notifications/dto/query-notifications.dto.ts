import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import type { NotificationType, NotificationStatus } from '../../../database/database.service';

export class QueryNotificationsDto {
  @IsEnum(['unread', 'read', 'archived', 'all'])
  @IsOptional()
  status?: NotificationStatus | 'all';

  @IsEnum(['licence_expiry', 'shift_assigned', 'shift_reminder', 'leave_decision', 'account_event', 'compliance_alert', 'system', 'all'])
  @IsOptional()
  type?: NotificationType | 'all';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}
