import { IsString, IsNotEmpty, IsDateString, IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceLineItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0)
  hours: number;

  @IsNumber()
  @Min(0)
  rate: number;

  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  jobTypeId?: string;
}

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsDateString()
  @IsNotEmpty()
  issueDate: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  items: InvoiceLineItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number = 20.0; // Standard UK 20% VAT

  @IsOptional()
  @IsString()
  notes?: string;
}
