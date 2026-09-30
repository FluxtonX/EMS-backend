import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';

export type ReportType =
  | 'employees'
  | 'attendance'
  | 'shifts'
  | 'hours'
  | 'absences'
  | 'licences'
  | 'assignments';

export class GenerateReportDto {
  @IsEnum(['employees', 'attendance', 'shifts', 'hours', 'absences', 'licences', 'assignments'])
  type: ReportType;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsEnum(['json', 'csv'])
  format?: 'json' | 'csv';
}
