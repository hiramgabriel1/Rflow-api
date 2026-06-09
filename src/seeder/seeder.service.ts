import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Company } from '../entities/company.entity';

@Injectable()
export class SeederService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  async onModuleInit() {
    let company = await this.companyRepo.findOne({ where: { organizationName: 'Mi Empresa' } });
    if (!company) {
      company = this.companyRepo.create({
        organizationName: 'Mi Empresa',
        industry: 'Technology',
        teamSize: 10,
      });
      await this.companyRepo.save(company);
    }

    const users = [
      { email: 'admin@miempresa.com', password: 'password123' },
      { email: 'prueba@gmail.com', password: 'prueba' },
    ];

    for (const u of users) {
      const exists = await this.userRepo.findOne({ where: { email: u.email } });
      if (!exists) {
        const user = this.userRepo.create({
          email: u.email,
          password: u.password,
        });
        user.company = company;
        await this.userRepo.save(user);
      }
    }

    console.log('✅ Seeder completed');
  }
}
