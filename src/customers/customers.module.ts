import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomerDirectoryService } from './directory/customer-directory.service';
import { CustomersController } from './customers.controller';
import { PrismaService } from 'src/prisma.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomerDirectoryService, PrismaService],
})
export class CustomersModule {}
