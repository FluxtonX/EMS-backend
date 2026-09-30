import { IsBoolean, IsNotEmpty } from 'class-validator';

export class VerifyDocumentDto {
  @IsNotEmpty()
  @IsBoolean()
  isVerified: boolean;
}
