import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService, AvailabilityEntity } from '../../database/database.service';
import { UpsertAvailabilityDto } from './dto/upsert-availability.dto';

const ALL_DAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(private readonly db: DatabaseService) {}

  async upsertAvailability(
    companyId: string,
    employeeId: string,
    dto: UpsertAvailabilityDto
  ): Promise<AvailabilityEntity> {
    // Verify employee exists in tenant
    const employee = await this.db.findEmployeeById(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const record = await this.db.upsertAvailability(companyId, employeeId, dto.dayOfWeek, {
      isAvailable: dto.isAvailable,
      preferredStartTime: dto.preferredStartTime,
      preferredEndTime: dto.preferredEndTime,
      notes: dto.notes,
    });

    this.logger.log(
      `Availability upserted for employee ${employeeId} on ${dto.dayOfWeek}: available=${dto.isAvailable}`
    );
    return record;
  }

  async getEmployeeAvailability(
    companyId: string,
    employeeId: string
  ): Promise<AvailabilityEntity[]> {
    const employee = await this.db.findEmployeeById(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }
    return this.db.findAvailabilityByEmployee(companyId, employeeId);
  }

  /**
   * Returns a full 7-day grid, filling in missing days with default unavailable.
   */
  async getEmployeeAvailabilityGrid(
    companyId: string,
    employeeId: string
  ): Promise<Record<string, AvailabilityEntity | null>> {
    const records = await this.getEmployeeAvailability(companyId, employeeId);
    const map: Record<string, AvailabilityEntity | null> = {};
    for (const day of ALL_DAYS) {
      map[day] = records.find((r) => r.dayOfWeek === day) ?? null;
    }
    return map;
  }
}
