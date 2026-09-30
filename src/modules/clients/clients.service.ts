import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  DatabaseService,
  ClientEntity,
  ContractEntity,
  InvoiceEntity,
  InvoiceItemEntity,
  InvoiceStatus,
} from '../../database/database.service';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateContractDto } from './dto/create-contract.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private readonly db: DatabaseService) {}

  // --- Clients ---

  async createClient(companyId: string, dto: CreateClientDto) {
    return this.db.createClient({
      companyId,
      name: dto.name.trim(),
      billingEmail: dto.billingEmail.toLowerCase().trim(),
      companyNumber: dto.companyNumber,
      vatNumber: dto.vatNumber,
      phone: dto.phone,
      address: dto.address,
      status: 'active',
      paymentTermsDays: dto.paymentTermsDays || 30,
      currency: 'GBP',
      notes: dto.notes,
    });
  }

  async findAllClients(companyId: string, query: { status?: string; search?: string } = {}) {
    const clients = await this.db.findClients(companyId, query);
    return Promise.all(
      clients.map(async (c) => {
        const contracts = await this.db.findContracts(companyId, { clientId: c.id });
        const invoices = await this.db.findInvoices(companyId, { clientId: c.id });
        const totalBilled = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
        return {
          ...c,
          activeContractsCount: contracts.filter((k) => k.status === 'active').length,
          totalInvoicedAmount: Math.round(totalBilled * 100) / 100,
        };
      })
    );
  }

  async findClientById(companyId: string, id: string) {
    const client = await this.db.findClientById(companyId, id);
    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found.`);
    }

    const contracts = await this.db.findContracts(companyId, { clientId: id });
    const invoices = await this.db.findInvoices(companyId, { clientId: id });

    return {
      ...client,
      contracts,
      invoices,
    };
  }

  // --- Contracts ---

  async createContract(companyId: string, dto: CreateContractDto) {
    const client = await this.db.findClientById(companyId, dto.clientId);
    if (!client) {
      throw new NotFoundException(`Client with ID ${dto.clientId} not found.`);
    }

    const site = await this.db.findSiteById(companyId, dto.siteId);
    if (!site) {
      throw new NotFoundException(`Site with ID ${dto.siteId} not found.`);
    }

    return this.db.createContract({
      companyId,
      clientId: dto.clientId,
      siteId: dto.siteId,
      contractNumber: dto.contractNumber,
      title: dto.title,
      startDate: dto.startDate,
      endDate: dto.endDate,
      billingCycle: dto.billingCycle || 'monthly',
      hourlyBillingRate: dto.hourlyBillingRate,
      status: 'active',
      notes: dto.notes,
    });
  }

  async findAllContracts(companyId: string, query: { clientId?: string; siteId?: string; status?: string } = {}) {
    const contracts = await this.db.findContracts(companyId, query);
    return Promise.all(
      contracts.map(async (c) => {
        const client = await this.db.findClientById(companyId, c.clientId);
        const site = await this.db.findSiteById(companyId, c.siteId);
        return {
          ...c,
          client: client ? { id: client.id, name: client.name, email: client.billingEmail } : null,
          site: site ? { id: site.id, name: site.name, code: site.code } : null,
        };
      })
    );
  }

  // --- Invoices ---

  async createInvoice(companyId: string, dto: CreateInvoiceDto) {
    const client = await this.db.findClientById(companyId, dto.clientId);
    if (!client) {
      throw new NotFoundException(`Client with ID ${dto.clientId} not found.`);
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('An invoice must contain at least one line item.');
    }

    const subtotal = Math.round(
      dto.items.reduce((sum, item) => sum + item.hours * item.rate, 0) * 100
    ) / 100;
    const taxRate = dto.taxRate !== undefined ? dto.taxRate : 20.0;
    const taxAmount = Math.round((subtotal * (taxRate / 100)) * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    const existingInvoices = await this.db.findInvoices(companyId);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(existingInvoices.length + 1).padStart(4, '0')}`;

    const invoice = await this.db.createInvoice({
      companyId,
      clientId: dto.clientId,
      contractId: dto.contractId,
      invoiceNumber,
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      subtotal,
      taxRate,
      taxAmount,
      totalAmount,
      currency: 'GBP',
      status: 'draft',
      notes: dto.notes,
    });

    const items: InvoiceItemEntity[] = [];
    for (const it of dto.items) {
      const createdItem = await this.db.createInvoiceItem({
        invoiceId: invoice.id,
        siteId: it.siteId,
        jobTypeId: it.jobTypeId,
        description: it.description,
        hours: it.hours,
        rate: it.rate,
        totalAmount: Math.round(it.hours * it.rate * 100) / 100,
      });
      items.push(createdItem);
    }

    return {
      ...invoice,
      client,
      items,
    };
  }

  async findAllInvoices(companyId: string, query: QueryInvoicesDto) {
    const invoices = await this.db.findInvoices(companyId, query);
    return Promise.all(
      invoices.map(async (inv) => {
        const client = await this.db.findClientById(companyId, inv.clientId);
        return {
          ...inv,
          client: client ? { id: client.id, name: client.name, billingEmail: client.billingEmail } : null,
        };
      })
    );
  }

  async findInvoiceById(companyId: string, id: string) {
    const invoice = await this.db.findInvoiceById(companyId, id);
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found.`);
    }

    const client = await this.db.findClientById(companyId, invoice.clientId);
    const items = await this.db.findInvoiceItems(id);
    let contract: ContractEntity | null = null;
    if (invoice.contractId) {
      contract = await this.db.findContractById(companyId, invoice.contractId);
    }

    return {
      ...invoice,
      client,
      contract,
      items,
    };
  }

  async updateInvoiceStatus(companyId: string, id: string, status: InvoiceStatus) {
    const invoice = await this.db.findInvoiceById(companyId, id);
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found.`);
    }

    const updates: Partial<InvoiceEntity> = { status };
    if (status === 'paid') {
      updates.paidAt = new Date();
    }

    return this.db.updateInvoice(companyId, id, updates);
  }

  // --- Profitability Analysis (Phase 14) ---

  /**
   * Compares billing rate revenue generated against guard pay rate costs.
   * Calculates gross margin and percentage per site / contract.
   */
  async getProfitabilitySummary(companyId: string) {
    const invoices = await this.db.findInvoices(companyId);
    const payRuns = await this.db.findPayRuns(companyId);

    const totalRevenue = invoices
      .filter((i) => i.status !== 'void')
      .reduce((sum, i) => sum + i.subtotal, 0);

    const totalGuardLaborCost = payRuns
      .filter((p) => p.status !== 'cancelled')
      .reduce((sum, p) => sum + p.totalGross, 0);

    const grossMargin = Math.round((totalRevenue - totalGuardLaborCost) * 100) / 100;
    const marginPercentage =
      totalRevenue > 0 ? Math.round((grossMargin / totalRevenue) * 1000) / 10 : 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalLaborCost: Math.round(totalGuardLaborCost * 100) / 100,
      grossProfit: grossMargin,
      marginPercentage,
      currency: 'GBP',
      activeContractsCount: (await this.db.findContracts(companyId, { status: 'active' })).length,
      activeClientsCount: (await this.db.findClients(companyId, { status: 'active' })).length,
    };
  }
}
