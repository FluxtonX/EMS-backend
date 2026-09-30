import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { StorageService } from './storage.service';
import { DatabaseModule } from '../../database/database.module';
import { DatabaseService } from '../../database/database.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('Phase 7: Documents Module Tests', () => {
  let service: DocumentsService;
  let db: DatabaseService;

  const companyA = 'comp_alpha_111';
  const companyB = 'comp_beta_222';
  const actorId = 'actor_admin_999';
  let employeeId: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [DocumentsService, StorageService],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    db = module.get<DatabaseService>(DatabaseService);

    // Create an employee in company A
    const emp = await db.createEmployee({
      companyId: companyA,
      employeeNumber: `EMP-${Date.now().toString().slice(-4)}`,
      firstName: 'David',
      lastName: 'Sterling',
      email: `david.${Date.now()}@example.co.uk`,
      phone: '+44 7700 900777',
      dateOfBirth: '1990-05-12',
      address: { line1: '45 Oxford St', city: 'London', postalCode: 'W1D 2DZ', country: 'UK' },
      emergencyContact: { name: 'Sarah', relationship: 'Sister', phone: '+44 7700 900888' },
      employmentStatus: 'active',
      employmentStartDate: '2026-01-01',
    });
    employeeId = emp.id;
  });

  it('should successfully upload an employee document', async () => {
    const fakePdfBase64 = Buffer.from('PDF_DUMMY_BINARY_DATA').toString('base64');
    const doc = await service.uploadEmployeeDocument(companyA, actorId, employeeId, {
      documentType: 'RightToWork',
      fileName: 'passport_scan.pdf',
      mimeType: 'application/pdf',
      fileDataBase64: fakePdfBase64,
    });

    expect(doc).toBeDefined();
    expect(doc.id).toBeDefined();
    expect(doc.documentType).toBe('RightToWork');
    expect(doc.isVerified).toBe(false);
    expect(doc.storagePath).toContain(companyA);
  });

  it('should reject upload if employee belongs to another company (tenant isolation)', async () => {
    const fakePdfBase64 = Buffer.from('PDF_DATA').toString('base64');
    await expect(
      service.uploadEmployeeDocument(companyB, actorId, employeeId, {
        documentType: 'Passport',
        fileName: 'passport.pdf',
        mimeType: 'application/pdf',
        fileDataBase64: fakePdfBase64,
      })
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject empty document content', async () => {
    await expect(
      service.uploadEmployeeDocument(companyA, actorId, employeeId, {
        documentType: 'Passport',
        fileName: 'empty.pdf',
        mimeType: 'application/pdf',
        fileDataBase64: '',
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('should generate a signed download URL for an authorized document', async () => {
    const fakePdfBase64 = Buffer.from('DOCUMENT_DATA').toString('base64');
    const doc = await service.uploadEmployeeDocument(companyA, actorId, employeeId, {
      documentType: 'SIA_Badge_Scan',
      fileName: 'sia_card.png',
      mimeType: 'image/png',
      fileDataBase64: fakePdfBase64,
    });

    const result = await service.getSignedDownloadUrl(companyA, doc.id);
    expect(result.downloadUrl).toBeDefined();
    expect(result.fileName).toBe(doc.fileName);
    expect(result.mimeType).toBe('image/png');
  });

  it('should verify document and update audit log', async () => {
    const fakePdfBase64 = Buffer.from('VERIFY_DATA').toString('base64');
    const doc = await service.uploadEmployeeDocument(companyA, actorId, employeeId, {
      documentType: 'ProofOfAddress',
      fileName: 'utility_bill.pdf',
      mimeType: 'application/pdf',
      fileDataBase64: fakePdfBase64,
    });

    const verified = await service.verifyDocument(companyA, actorId, doc.id, { isVerified: true });
    expect(verified.isVerified).toBe(true);
    expect(verified.verifiedBy).toBe(actorId);
  });

  it('should delete a document cleanly', async () => {
    const fakePdfBase64 = Buffer.from('DELETE_DATA').toString('base64');
    const doc = await service.uploadEmployeeDocument(companyA, actorId, employeeId, {
      documentType: 'TrainingCert',
      fileName: 'first_aid.pdf',
      mimeType: 'application/pdf',
      fileDataBase64: fakePdfBase64,
    });

    const deleted = await service.deleteDocument(companyA, actorId, doc.id);
    expect(deleted).toBe(true);

    await expect(service.getDocumentById(companyA, doc.id)).rejects.toThrow(NotFoundException);
  });
});
