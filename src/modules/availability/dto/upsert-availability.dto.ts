import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { DayOfWeek } from '../../../database/database.service';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpsertAvailabilityDto {
  @IsEnum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  dayOfWeek: DayOfWeek;

  @IsBoolean()
  isAvailable: boolean;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'preferredStartTime must be HH:mm format' })
  preferredStartTime?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'preferredEndTime must be HH:mm format' })
  preferredEndTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}
