import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService, DocumentEntity } from '../../database/database.service';
import { StorageService } from './storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private db: DatabaseService,
    private storage: StorageService
  ) {}

  async uploadEmployeeDocument(
    companyId: string,
    actorId: string,
    employeeId: string,
    dto: UploadDocumentDto
  ): Promise<DocumentEntity> {
    // 1. Verify employee exists and belongs to company
    const employee = await this.db.findEmployeeById(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee '${employeeId}' not found.`);
    }

    // 2. Parse file buffer
    let buffer: Buffer;
    try {
      // Strip potential data URL prefix if present (e.g. "data:application/pdf;base64,")
      const base64Clean = dto.fileDataBase64.includes(',')
        ? dto.fileDataBase64.split(',')[1]
        : dto.fileDataBase64;
      buffer = Buffer.from(base64Clean, 'base64');
    } catch {
      throw new BadRequestException('Invalid base64 payload provided for document content.');
    }

    if (buffer.length === 0) {
      throw new BadRequestException('Cannot upload an empty document file.');
    }

    // Enforce 15MB file size limit
    const MAX_SIZE = 15 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new BadRequestException('Document file size exceeds the maximum limit of 15MB.');
    }

    // 3. Upload to private storage
    const uploadResult = await this.storage.uploadFile(
      companyId,
      employeeId,
      dto.fileName,
      buffer,
      dto.mimeType
    );

    // 4. Create document database record
    const document = await this.db.createDocument({
      companyId,
      employeeId,
      documentType: dto.documentType.trim(),
      fileName: uploadResult.fileName,
      storagePath: uploadResult.storagePath,
      mimeType: uploadResult.mimeType,
      fileSizeBytes: uploadResult.fileSizeBytes,
      isVerified: false,
    });

    // 5. Audit log
    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'DOCUMENT_UPLOADED',
      entity: 'documents',
      entityId: document.id,
      newValue: {
        employeeId,
        fileName: document.fileName,
        documentType: document.documentType,
        sizeBytes: document.fileSizeBytes,
      },
    });

    return document;
  }

  async findEmployeeDocuments(
    companyId: string,
    employeeId: string
  ): Promise<DocumentEntity[]> {
    const employee = await this.db.findEmployeeById(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee '${employeeId}' not found.`);
    }
    return this.db.findDocumentsByEmployeeId(companyId, employeeId);
  }

  async getDocumentById(companyId: string, id: string): Promise<DocumentEntity> {
    const doc = await this.db.findDocumentById(companyId, id);
    if (!doc) {
      throw new NotFoundException(`Document '${id}' not found.`);
    }
    return doc;
  }

  async getSignedDownloadUrl(companyId: string, id: string): Promise<{ downloadUrl: string; fileName: string; mimeType: string }> {
    const doc = await this.getDocumentById(companyId, id);
    const signedUrl = await this.storage.createSignedUrl(doc.storagePath, 900); // 15 mins expiry
    return {
      downloadUrl: signedUrl,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
    };
  }

  async verifyDocument(
    companyId: string,
    actorId: string,
    id: string,
    dto: VerifyDocumentDto
  ): Promise<DocumentEntity> {
    const doc = await this.getDocumentById(companyId, id);
    const updated = await this.db.verifyDocument(companyId, id, actorId, dto.isVerified);

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'DOCUMENT_VERIFIED',
      entity: 'documents',
      entityId: id,
      oldValue: { isVerified: doc.isVerified },
      newValue: { isVerified: dto.isVerified },
    });

    return updated;
  }

  async deleteDocument(companyId: string, actorId: string, id: string): Promise<boolean> {
    const doc = await this.getDocumentById(companyId, id);
    await this.storage.deleteFile(doc.storagePath);
    const deleted = await this.db.deleteDocument(companyId, id);

    await this.db.recordAudit({
      companyId,
      userId: actorId,
      action: 'DOCUMENT_DELETED',
      entity: 'documents',
      entityId: id,
      oldValue: { fileName: doc.fileName, employeeId: doc.employeeId },
    });

    return deleted;
  }
}
