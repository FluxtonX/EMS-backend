import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import type { InvoiceStatus } from '../../database/database.service';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  // --- Clients Endpoints ---

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CLIENT_MANAGE)
  async createClient(
    @TenantId() companyId: string,
    @Body() dto: CreateClientDto
  ) {
    return this.clientsService.createClient(companyId, dto);
  }

  @Get()
  @RequirePermissions(Permission.CLIENT_VIEW)
  async findAllClients(
    @TenantId() companyId: string,
    @Query('status') status?: string,
    @Query('search') search?: string
  ) {
    return this.clientsService.findAllClients(companyId, { status, search });
  }

  @Get('profitability')
  @RequirePermissions(Permission.INVOICE_VIEW)
  async getProfitabilitySummary(@TenantId() companyId: string) {
    return this.clientsService.getProfitabilitySummary(companyId);
  }

  @Get(':id')
  @RequirePermissions(Permission.CLIENT_VIEW)
  async findClientById(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.clientsService.findClientById(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CLIENT_MANAGE)
  async updateClient(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto
  ) {
    return this.clientsService.updateClient(companyId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.CLIENT_MANAGE)
  async deleteClient(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.clientsService.deleteClient(companyId, id);
  }

  // --- Contracts Endpoints ---

  @Post('contracts/new')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CONTRACT_MANAGE)
  async createContract(
    @TenantId() companyId: string,
    @Body() dto: CreateContractDto
  ) {
    return this.clientsService.createContract(companyId, dto);
  }

  @Get('contracts/list')
  @RequirePermissions(Permission.CONTRACT_VIEW)
  async findAllContracts(
    @TenantId() companyId: string,
    @Query('clientId') clientId?: string,
    @Query('siteId') siteId?: string,
    @Query('status') status?: string
  ) {
    return this.clientsService.findAllContracts(companyId, { clientId, siteId, status });
  }

  @Patch('contracts/:id')
  @RequirePermissions(Permission.CONTRACT_MANAGE)
  async updateContract(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContractDto
  ) {
    return this.clientsService.updateContract(companyId, id, dto);
  }

  @Delete('contracts/:id')
  @RequirePermissions(Permission.CONTRACT_MANAGE)
  async deleteContract(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.clientsService.deleteContract(companyId, id);
  }

  // --- Invoices Endpoints ---

  @Post('invoices/new')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.INVOICE_MANAGE)
  async createInvoice(
    @TenantId() companyId: string,
    @Body() dto: CreateInvoiceDto
  ) {
    return this.clientsService.createInvoice(companyId, dto);
  }

  @Get('invoices/list')
  @RequirePermissions(Permission.INVOICE_VIEW)
  async findAllInvoices(
    @TenantId() companyId: string,
    @Query() query: QueryInvoicesDto
  ) {
    return this.clientsService.findAllInvoices(companyId, query);
  }

  @Get('invoices/:id')
  @RequirePermissions(Permission.INVOICE_VIEW)
  async findInvoiceById(
    @TenantId() companyId: string,
    @Param('id') id: string
  ) {
    return this.clientsService.findInvoiceById(companyId, id);
  }

  @Patch('invoices/:id/status')
  @RequirePermissions(Permission.INVOICE_MANAGE)
  async updateInvoiceStatus(
    @TenantId() companyId: string,
    @Param('id') id: string,
    @Body('status') status: InvoiceStatus
  ) {
    return this.clientsService.updateInvoiceStatus(companyId, id, status);
  }
}
