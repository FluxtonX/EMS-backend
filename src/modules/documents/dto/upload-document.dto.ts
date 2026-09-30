import { IsNotEmpty, IsString } from 'class-validator';

export class UploadDocumentDto {
  @IsNotEmpty()
  @IsString()
  documentType: string; // e.g. 'Passport', 'RightToWork', 'SIA_Badge_Scan', 'ProofOfAddress', 'Contract'

  @IsNotEmpty()
  @IsString()
  fileName: string;

  @IsNotEmpty()
  @IsString()
  mimeType: string;

  @IsNotEmpty()
  @IsString()
  fileDataBase64: string;
}
