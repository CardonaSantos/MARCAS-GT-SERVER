import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductCatalogQueryService } from './catalog/product-catalog-query.service';
import { ProductCatalogAccessGuard } from './catalog/catalog-access.guard';
import { ProductController } from './product.controller';
import { PrismaService } from 'src/prisma.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Module({
  controllers: [ProductController],
  providers: [ProductService, ProductCatalogQueryService, ProductCatalogAccessGuard, PrismaService, CloudinaryService],
})
export class ProductModule {}
