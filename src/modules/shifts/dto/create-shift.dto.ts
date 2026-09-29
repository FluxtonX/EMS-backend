import { IsNotEmpty, IsUUID, IsString, IsOptional, IsInt, Min, Matches } from 'class-validator';

export class CreateShiftDto {
  @IsUUID()
  @IsNotEmpty()
  siteId: string;

  @IsUUID()
  @IsNotEmpty()
  siteJobId: string;

  @IsUUID()
  @IsOptional()
  employeeId?: string; // Optional: if omitted or null, it's an Open Position

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'shiftDate must be YYYY-MM-DD format' })
  shiftDate: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM in 24h format' })
  startTime: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:MM in 24h format' })
  endTime: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  breakMinutes?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
