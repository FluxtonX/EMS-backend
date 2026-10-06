import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('audit')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AuditController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @Roles(Role.Owner, Role.Admin)
  async getAuditLogs(
    @TenantId() companyId: string,
    @Query('limit') limit?: string
  ) {
    return this.companiesService.getAuditLogs(companyId);
  }
}
