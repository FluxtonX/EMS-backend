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
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { QueryEmployeesDto } from './dto/query-employees.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class EmployeesController {
  constructor(private employeesService: EmployeesService) {}

  @Get()
  @Roles(Role.Owner, Role.Admin, Role.Manager, Role.Supervisor)
  async findAll(
    @TenantId() companyId: string,
    @Query() query: QueryEmployeesDto
  ) {
    return this.employeesService.findAll(companyId, query);
  }

  @Get(':id')
  @Roles(Role.Owner, Role.Admin, Role.Manager, Role.Supervisor)
  async findById(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.employeesService.findById(companyId, id);
  }

  @Post()
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateEmployeeDto
  ) {
    return this.employeesService.create(companyId, actor.id, dto);
  }

  @Patch(':id')
  @Roles(Role.Owner, Role.Admin, Role.Manager)
  async update(
    @TenantId() companyId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto
  ) {
    return this.employeesService.update(companyId, actor.id, id, dto);
  }
}
