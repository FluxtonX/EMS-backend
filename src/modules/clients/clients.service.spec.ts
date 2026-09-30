import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients.service';
import { DatabaseService } from '../../database/database.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ClientsService', () => {
  let service: ClientsService;
  let db: DatabaseService;

  const mockCompanyId = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        {
          provide: DatabaseService,
          useValue: {
            createClient: jest.fn().mockImplementation((data) =>
              Promise.resolve({
                id: 'cli-1',
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            ),
            findClients: jest.fn().mockResolvedValue([
              {
                id: 'cli-1',
                companyId: mockCompanyId,
                name: 'Canary Wharf Estates Ltd',
                billingEmail: 'billing@canarywharf.com',
                status: 'active',
              },
            ]),
            findClientById: jest.fn().mockImplementation((cId, id) => {
              if (id === 'cli-1') {
                return Promise.resolve({
                  id: 'cli-1',
                  companyId: mockCompanyId,
                  name: 'Canary Wharf Estates Ltd',
                  billingEmail: 'billing@canarywharf.com',
                  status: 'active',
                });
              }
              return Promise.resolve(null);
            }),
            findSiteById: jest.fn().mockResolvedValue({
              id: 'site-1',
              name: 'Canary Wharf Tower A',
              code: 'CWT-A',
            }),
            createContract: jest.fn().mockImplementation((data) =>
              Promise.resolve({
                id: 'con-1',
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            ),
            findContracts: jest.fn().mockResolvedValue([
              {
                id: 'con-1',
                clientId: 'cli-1',
                siteId: 'site-1',
                hourlyBillingRate: 28.5,
                status: 'active',
              },
            ]),
            createInvoice: jest.fn().mockImplementation((data) =>
              Promise.resolve({
                id: 'inv-1',
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            ),
            createInvoiceItem: jest.fn().mockImplementation((data) =>
              Promise.resolve({
                id: 'item-1',
                ...data,
                createdAt: new Date(),
              })
            ),
            findInvoices: jest.fn().mockResolvedValue([
              {
                id: 'inv-1',
                clientId: 'cli-1',
                subtotal: 5000.0,
                taxAmount: 1000.0,
                totalAmount: 6000.0,
                status: 'paid',
              },
            ]),
            findInvoiceById: jest.fn(),
            findInvoiceItems: jest.fn().mockResolvedValue([]),
            findPayRuns: jest.fn().mockResolvedValue([
              {
                id: 'pr-1',
                totalGross: 3500.0,
                status: 'paid',
              },
            ]),
          },
        },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createClient', () => {
    it('should create client with active status and 30-day payment terms', async () => {
      const result = await service.createClient(mockCompanyId, {
        name: 'Mayfair Commercial Properties',
        billingEmail: 'accounts@mayfairprop.co.uk',
        companyNumber: '09876543',
        vatNumber: 'GB123456789',
      });

      expect(db.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: mockCompanyId,
          name: 'Mayfair Commercial Properties',
          billingEmail: 'accounts@mayfairprop.co.uk',
          paymentTermsDays: 30,
          status: 'active',
        })
      );
      expect(result.id).toBe('cli-1');
    });
  });

  describe('createContract', () => {
    it('should link client and site with agreed hourly billing rate', async () => {
      const result = await service.createContract(mockCompanyId, {
        clientId: 'cli-1',
        siteId: 'site-1',
        title: 'Canary Wharf Tower Security Services',
        contractNumber: 'CNT-2026-001',
        startDate: '2026-09-01',
        hourlyBillingRate: 28.5,
      });

      expect(db.createContract).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'cli-1',
          siteId: 'site-1',
          hourlyBillingRate: 28.5,
          status: 'active',
        })
      );
      expect(result.id).toBe('con-1');
    });

    it('should throw NotFoundException if client does not exist', async () => {
      await expect(
        service.createContract(mockCompanyId, {
          clientId: 'non-existent',
          siteId: 'site-1',
          title: 'Test Contract',
          contractNumber: 'CNT-002',
          startDate: '2026-09-01',
          hourlyBillingRate: 25.0,
        })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createInvoice', () => {
    it('should compute 20% VAT and generate invoice items', async () => {
      const result = await service.createInvoice(mockCompanyId, {
        clientId: 'cli-1',
        issueDate: '2026-09-30',
        dueDate: '2026-10-30',
        taxRate: 20.0,
        items: [
          {
            description: 'Canary Wharf Security Officer Shift Coverage (100 hours)',
            hours: 100,
            rate: 25.0, // Subtotal: 2500
          },
        ],
      });

      expect(db.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 2500.0,
          taxRate: 20.0,
          taxAmount: 500.0,
          totalAmount: 3000.0,
          status: 'draft',
        })
      );
      expect(result.items).toHaveLength(1);
    });

    it('should throw BadRequestException if no items provided', async () => {
      await expect(
        service.createInvoice(mockCompanyId, {
          clientId: 'cli-1',
          issueDate: '2026-09-30',
          dueDate: '2026-10-30',
          items: [],
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getProfitabilitySummary', () => {
    it('should compute gross revenue, labor cost, and margin percentage', async () => {
      const summary = await service.getProfitabilitySummary(mockCompanyId);
      // Revenue subtotal: 5000.0, Labor: 3500.0 -> Profit: 1500.0 -> Margin: 30%
      expect(summary.totalRevenue).toBe(5000.0);
      expect(summary.totalLaborCost).toBe(3500.0);
      expect(summary.grossProfit).toBe(1500.0);
      expect(summary.marginPercentage).toBe(30.0);
    });
  });
});
