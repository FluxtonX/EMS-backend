import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { AuditController } from './audit.controller';

@Module({
  controllers: [CompaniesController, AuditController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
