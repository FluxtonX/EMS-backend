import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { TransferAssignmentDto, CloseAssignmentDto } from './dto/transfer-assignment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  @RequirePermissions(Permission.ASSIGNMENT_VIEW)
  async findAll(
    @TenantId() companyId: string,
    @Query('siteId') siteId?: string,
    @Query('status') status?: string,
  ) {
    return this.assignmentsService.findAll(companyId, { siteId, status });
  }

  @Post()
  @RequirePermissions(Permission.ASSIGNMENT_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @TenantId() companyId: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.assignmentsService.create(companyId, dto, user?.id);
  }

  @Get('employee/:employeeId')
  @RequirePermissions(Permission.ASSIGNMENT_VIEW)
  async getEmployeeAssignments(
    @TenantId() companyId: string,
    @Param('employeeId') employeeId: string
  ) {
    return this.assignmentsService.getEmployeeAssignments(companyId, employeeId);
  }

  @Get('employee/:employeeId/current')
  @RequirePermissions(Permission.ASSIGNMENT_VIEW)
  async getActiveAssignment(
    @TenantId() companyId: string,
    @Param('employeeId') employeeId: string
  ) {
    return this.assignmentsService.getActiveAssignment(companyId, employeeId);
  }

  @Post('employee/:employeeId/transfer')
  @RequirePermissions(Permission.ASSIGNMENT_MANAGE)
  @HttpCode(HttpStatus.OK)
  async transfer(
    @TenantId() companyId: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: TransferAssignmentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.assignmentsService.transfer(companyId, employeeId, dto, user?.id);
  }

  @Patch(':id/close')
  @RequirePermissions(Permission.ASSIGNMENT_MANAGE)
  async close(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Body() dto: CloseAssignmentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.assignmentsService.close(companyId, id, dto, user?.id);
  }
}
