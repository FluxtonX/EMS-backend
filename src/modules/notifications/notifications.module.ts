import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { BrevoService } from './brevo.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, BrevoService],
  exports: [NotificationsService, BrevoService],
})
export class NotificationsModule {}
