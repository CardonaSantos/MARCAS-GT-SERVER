import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { ProviderService } from './provider.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Controller('provider')
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Post()
  async create(@Body() createProviderDto: CreateProviderDto) {
    return await this.providerService.create(createProviderDto);
  }

  @Get()
  async findAll() {
    return await this.providerService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: string) {
    return await this.providerService.findOne(+id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProviderDto: UpdateProviderDto,
  ) {
    return await this.providerService.update(id, updateProviderDto);
  }

  @Delete('/delete-provider/:id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.providerService.remove(id);
  }

  // Compatibilidad con los clientes legacy, sin exponer eliminación masiva.
  @Delete(':id')
  async removeById(@Param('id', ParseIntPipe) id: number) {
    return await this.providerService.remove(id);
  }
}
