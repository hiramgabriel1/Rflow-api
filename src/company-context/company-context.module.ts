import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { CompetitorCompany } from '../entities/competitor-company.entity';
import { CompanyContextService } from './company-context.service';
import { CompanyContextController } from './company-context.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Company, CompetitorCompany])],
  controllers: [CompanyContextController],
  providers: [CompanyContextService],
  exports: [CompanyContextService],
})
export class CompanyContextModule {}
