import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { QueryShiftsDto, QueryEligibleEmployeesDto } from './dto/query-shifts.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@Controller('shifts')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post()
  @RequirePermissions(Permission.SHIFT_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @TenantId() companyId: string,
    @Body() dto: CreateShiftDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.shiftsService.create(companyId, dto, user?.id);
  }

  @Get()
  @RequirePermissions(Permission.SHIFT_VIEW)
  async findAll(
    @TenantId() companyId: string,
    @Query() query: QueryShiftsDto
  ) {
    return this.shiftsService.findAll(companyId, query);
  }

  @Get('eligible-employees')
  @RequirePermissions(Permission.SHIFT_VIEW)
  async getEligibleEmployees(
    @TenantId() companyId: string,
    @Query() query: QueryEligibleEmployeesDto
  ) {
    return this.shiftsService.getEligibleEmployees(companyId, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.SHIFT_VIEW)
  async findById(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.shiftsService.findById(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  async update(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateShiftDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.shiftsService.update(companyId, id, dto, user?.id);
  }

  @Delete(':id')
  @RequirePermissions(Permission.SHIFT_MANAGE)
  async delete(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.shiftsService.delete(companyId, id, user?.id);
  }
}
