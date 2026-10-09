import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsOptional()
  @MaxLength(4000, { message: 'Message cannot exceed 4000 characters' })
  content?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000, { message: 'Message cannot exceed 4000 characters' })
  text?: string;
}

