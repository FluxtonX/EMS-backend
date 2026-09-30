import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { UpsertAvailabilityDto } from './dto/upsert-availability.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@Controller('employees/:employeeId/availability')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /**
   * GET /api/v1/employees/:employeeId/availability
   * Get full 7-day availability grid for an employee.
   */
  @Get()
  @RequirePermissions(Permission.LEAVE_REQUEST)
  async getGrid(
    @TenantId() companyId: string,
    @Param('employeeId') employeeId: string
  ) {
    const grid = await this.availabilityService.getEmployeeAvailabilityGrid(
      companyId,
      employeeId
    );
    return { data: grid };
  }

  /**
   * PUT /api/v1/employees/:employeeId/availability
   * Upsert availability for one day of week. Idempotent.
   */
  @Put()
  @RequirePermissions(Permission.LEAVE_REQUEST)
  @HttpCode(HttpStatus.OK)
  async upsert(
    @TenantId() companyId: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: UpsertAvailabilityDto
  ) {
    const record = await this.availabilityService.upsertAvailability(
      companyId,
      employeeId,
      dto
    );
    return { data: record };
  }
}
