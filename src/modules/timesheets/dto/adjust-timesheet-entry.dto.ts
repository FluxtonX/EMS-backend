import { IsInt, IsNotEmpty, IsString, Min, Max, MaxLength } from 'class-validator';

export class AdjustTimesheetEntryDto {
  @IsInt()
  @Min(-480) // up to -8 hours adjustment
  @Max(480)  // up to +8 hours adjustment
  adjustmentMinutes: number;

  @IsString()
  @IsNotEmpty({ message: 'A justification is mandatory for auditing supervisor adjustments' })
  @MaxLength(500)
  adjustmentReason: string;
}
