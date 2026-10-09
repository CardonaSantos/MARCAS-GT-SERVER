import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { AuthGuard } from '@nestjs/passport';
import { CustomerDirectoryService } from './directory/customer-directory.service';
import { CustomerDirectoryQueryDto } from './directory/customer-directory-query.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerFromProspectDto } from './dto/create-customer-from-prospect';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly directory: CustomerDirectoryService,
  ) {}

  @Post()
  async createCustomer(@Body() createCustomerDto: CreateCustomerDto) {
    return await this.customersService.create(createCustomerDto);
  }

  @Post('/create-customer-from-prospect')
  async createCustomerFromProspect(
    @Body() createCustomerDto: CreateCustomerFromProspectDto,
  ) {
    return await this.customersService.createClienteFromProspect(
      createCustomerDto,
    );
  }

  @Get()
  async findAllCustomers() {
    return await this.customersService.findAllCustomers();
  }

  /** Nuevo contrato paginado; el endpoint legacy se conserva para otros consumidores. */
  @Get('/directorio')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  listDirectory(@Query() query: CustomerDirectoryQueryDto) {
    return this.directory.list(query);
  }

  @Get('/directorio/:id')
  @UseGuards(AuthGuard('jwt'))
  directoryDetail(@Param('id', ParseIntPipe) id: number) {
    return this.directory.detail(id);
  }

  @Get('/get-all-customers')
  async findCustomersAll() {
    return await this.customersService.findCustomerWithLocation();
  }

  @Get('/all-customers-with-discount')
  async findAllCustomersWithDiscount() {
    return await this.customersService.findOneCustomersWithDiscount();
  }

  @Get('/customer-simple')
  async SimpleCustomers() {
    return await this.customersService.findSimple();
  }

  @Get(':id')
  findOneCustomer(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.findOneCustomer(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ) {
    console.log('CONTROLLER:', updateCustomerDto);

    return await this.customersService.updateOneCustomer(id, updateCustomerDto);
  }

  @Delete('/delete-all')
  async removeAllCustomers() {
    return await this.customersService.removeAllCustomers();
  }
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.customersService.removeOneCustomer(id);
  }
}
