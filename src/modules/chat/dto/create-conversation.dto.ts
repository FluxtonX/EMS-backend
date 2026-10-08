import { IsNotEmpty, IsString } from 'class-validator';

export class CreateConversationDto {
  @IsString({ message: 'Employee or Participant ID must be a string' })
  @IsNotEmpty({ message: 'Employee or Participant ID is required' })
  employeeId: string;
}
