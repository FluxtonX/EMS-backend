import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('employees/:employeeId/documents')
  @RequirePermissions(Permission.DOCUMENT_UPLOAD)
  @HttpCode(HttpStatus.CREATED)
  async uploadDocument(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: UploadDocumentDto
  ) {
    return this.documentsService.uploadEmployeeDocument(companyId, user?.id, employeeId, dto);
  }

  @Get('employees/:employeeId/documents')
  @RequirePermissions(Permission.DOCUMENT_VIEW)
  async getEmployeeDocuments(
    @TenantId() companyId: string,
    @Param('employeeId') employeeId: string
  ) {
    return this.documentsService.findEmployeeDocuments(companyId, employeeId);
  }

  @Get('documents/:id')
  @RequirePermissions(Permission.DOCUMENT_VIEW)
  async getDocument(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.documentsService.getDocumentById(companyId, id);
  }

  @Get('documents/:id/download')
  @RequirePermissions(Permission.DOCUMENT_VIEW)
  async getDownloadUrl(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.documentsService.getSignedDownloadUrl(companyId, id);
  }

  @Patch('documents/:id/verify')
  @RequirePermissions(Permission.DOCUMENT_VERIFY)
  async verifyDocument(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VerifyDocumentDto
  ) {
    return this.documentsService.verifyDocument(companyId, user?.id, id, dto);
  }

  @Delete('documents/:id')
  @RequirePermissions(Permission.DOCUMENT_DELETE)
  async deleteDocument(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string
  ) {
    return this.documentsService.deleteDocument(companyId, user?.id, id);
  }
}
