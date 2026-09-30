import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class GenerateTimesheetsDto {
  @IsDateString()
  periodStart: string; // e.g. '2026-10-05'

  @IsDateString()
  periodEnd: string;   // e.g. '2026-10-11'

  @IsUUID()
  @IsOptional()
  employeeId?: string; // Optional: generate for specific employee or all active employees
}
