import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { SocialLead } from '../entities/social-lead.entity';
import { SocialScrapingService } from './social-scraping.service';
import { SocialScrapingController } from './social-scraping.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Company, SocialLead])],
  controllers: [SocialScrapingController],
  providers: [SocialScrapingService],
  exports: [SocialScrapingService],
})
export class SocialScrapingModule {}
