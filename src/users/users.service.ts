import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { CompanyData } from './company.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  async getCompanyData(companyId: string): Promise<CompanyData> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new Error('Company not found');
    }
    return {
      id: company.id,
      organizationName: company.organizationName,
      websiteURL: company.websiteURL,
      industry: company.industry,
      teamSize: company.teamSize,
      contextCompany: company.contextCompany,
      createdAt: company.createdAt.toISOString(),
    };
  }
}
