import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { LicencesController } from './licences.controller';
import { LicencesService } from './licences.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LicencesController],
  providers: [LicencesService],
  exports: [LicencesService],
})
export class LicencesModule {}
