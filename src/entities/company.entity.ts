import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { CompetitorCompany } from './competitor-company.entity';
import { SocialLead } from './social-lead.entity';

@Entity()
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  organizationName: string;

  @Column({ nullable: true })
  websiteURL: string;

  @Column({ nullable: true })
  industry: string;

  @Column({ nullable: true })
  teamSize: number;

  @Column({ type: 'text', nullable: true })
  contextCompany: string;

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @OneToMany(() => CompetitorCompany, (competitor) => competitor.company, { cascade: true })
  competitors: CompetitorCompany[];

  @OneToMany(() => SocialLead, (lead) => lead.company, { cascade: true })
  socialLeads: SocialLead[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
