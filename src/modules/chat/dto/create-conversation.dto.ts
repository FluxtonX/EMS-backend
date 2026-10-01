import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateConversationDto {
  @IsUUID('4', { message: 'A valid employee UUID is required' })
  @IsNotEmpty({ message: 'Employee ID is required' })
  employeeId: string;
}
