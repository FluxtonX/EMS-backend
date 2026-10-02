import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { InviteTeamMemberDto, UpdateMemberStatusDto } from './dto/invite-team-member.dto';
import { CreateManualTeamMemberDto } from './dto/create-manual-team-member.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

@Controller('team')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  async getTeamMembers(@TenantId() companyId: string) {
    return this.teamService.getTeamMembers(companyId);
  }

  @Post('invite')
  @Roles(Role.Owner, Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  async inviteTeamMember(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: InviteTeamMemberDto
  ) {
    return this.teamService.inviteTeamMember(companyId, actor.id, actor.role, dto);
  }

  @Post('manual')
  @Roles(Role.Owner, Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  async createManualTeamMember(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateManualTeamMemberDto
  ) {
    return this.teamService.createManualTeamMember(companyId, actor.id, actor.role, dto);
  }

  @Post('invitations/:id/resend')
  @Roles(Role.Owner, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async resendInvitation(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string
  ) {
    return this.teamService.resendInvitation(companyId, actor.id, id);
  }

  @Delete('invitations/:id')
  @Roles(Role.Owner, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async revokeInvitation(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string
  ) {
    return this.teamService.revokeInvitation(companyId, actor.id, id);
  }

  @Patch('members/:id/status')
  @Roles(Role.Owner, Role.Admin)
  async updateMemberStatus(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMemberStatusDto
  ) {
    return this.teamService.updateMemberStatus(companyId, actor.id, actor.role, id, dto);
  }
}
