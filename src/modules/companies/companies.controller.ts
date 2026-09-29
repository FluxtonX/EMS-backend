import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { AddMemberDto } from './dto/add-member.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller('companies')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get('current')
  async getCurrentCompany(@TenantId() companyId: string) {
    return this.companiesService.getCurrentCompany(companyId);
  }

  @Get('members')
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  async getMembers(@TenantId() companyId: string) {
    return this.companiesService.getMembers(companyId);
  }

  @Post('members')
  @Roles(Role.Owner, Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: AddMemberDto
  ) {
    return this.companiesService.addMember(companyId, actor.id, dto);
  }

  @Get('audit')
  @Roles(Role.Owner, Role.Admin)
  async getAuditLogs(@TenantId() companyId: string) {
    return this.companiesService.getAuditLogs(companyId);
  }
}
