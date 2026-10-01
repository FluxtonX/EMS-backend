import { IsNotEmpty, IsEnum, IsDateString, IsOptional, IsString } from 'class-validator';

export enum MyLeaveType {
  Annual = 'annual',
  Sick = 'sick',
  Emergency = 'emergency',
  Unpaid = 'unpaid',
  Other = 'other',
}

export class MyLeaveRequestDto {
  @IsEnum(MyLeaveType)
  @IsNotEmpty()
  leaveType: MyLeaveType;

  @IsDateString()
  @IsNotEmpty()
  startDate: string; // 'YYYY-MM-DD'

  @IsDateString()
  @IsNotEmpty()
  endDate: string; // 'YYYY-MM-DD'

  @IsString()
  @IsOptional()
  reason?: string;
}
