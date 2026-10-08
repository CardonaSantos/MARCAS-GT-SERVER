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
  BadRequestException,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AuthGuard } from '@nestjs/passport';
import { ProductCatalogAccessGuard } from './catalog/catalog-access.guard';
import { ProductCatalogListQueryDto } from './catalog/catalog-query.dto';
import { ProductCatalogQueryService } from './catalog/product-catalog-query.service';


import { join } from 'path';

@Controller('product')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly catalog: ProductCatalogQueryService,
  ) {}

  @Post()
  async create(@Body() createProductDto: CreateProductDto) {
    return await this.productService.createProduct(createProductDto);
  }

  @Get('/search')
  async searchProducts(
    @Query('query') query: string,
    @Query('categoria') categoria: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    return await this.productService.searchProducts(
      query,
      categoria,
      pageNumber,
      limitNumber,
    );
  }

  @Get()
  async findAll(@Query('page') page = '1', @Query('limit') limit = '10') {
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    return await this.productService.findAllProducts(pageNumber, limitNumber);
  }

  /**
   * Contrato nuevo para Catálogo de productos (solo ADMIN).
   * La antigua ruta /get-product-to-inventary se mantiene hasta migrar la UI.
   */
  @Get('catalogo')
  @UseGuards(AuthGuard('jwt'), ProductCatalogAccessGuard)
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
  catalogList(
    @Query() query: ProductCatalogListQueryDto,
    @Req() request: { catalogEmpresaId: number },
  ) {
    return this.catalog.list(query, request.catalogEmpresaId);
  }

  @Get('catalogo/:id')
  @UseGuards(AuthGuard('jwt'), ProductCatalogAccessGuard)
  catalogDetail(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: { catalogEmpresaId: number },
  ) {
    return this.catalog.detail(id, request.catalogEmpresaId);
  }

  @Get('/get-product-to-inventary')
  async findAllProductToInventary() {
    return await this.productService.findAllProductToInventary();
  }

  @Get('/carga-masiva')
  async makeCargaMasiva() {
    const ruta = join(process.cwd(), 'src', 'assets', 'ProductosMARCASGT.csv');
    return await this.productService.loadCSVandImportProducts(ruta);
  }
  // @Get('/formatear-productos-trim')
  // async format() {
  //   return await this.productService.limpiarProductos();
  // }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.productService.findOneProduct(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    console.log('La data es: ', updateProductDto);
    return await this.productService.updateOneProduct(id, updateProductDto);
  }

  @Patch('/update-images-product/:productID')
  async updateImagesToProduct(
    @Param('productID', ParseIntPipe) productID: number,
    // @Body() images: string[],

    @Body('images') images: string[], // Extraemos solo el array de imágenes
  ) {
    console.log('La data es: ', images);
    return await this.productService.updateImagesToProduct(productID, images);
  }

  @Delete('/delete-all-products')
  async removeAllProducts() {
    return await this.productService.removeAllProducts();
  }

  @Delete('/delete-one-image-product/:id/image/:imageId')
  async removeOneImageProduct(
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @Query('publicId') publicId: string, // Recibirlo desde query params
  ) {
    if (!publicId) {
      throw new BadRequestException('El publicId es requerido');
    }

    return await this.productService.removeOneImageProduct(
      id,
      publicId,
      imageId,
    );
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.productService.removeOneProduct(id);
  }
}
