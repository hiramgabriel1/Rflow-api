import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity()
export class SocialLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  username: string;

  @Column({ nullable: true })
  fullName: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  bio: string;

  @Column({ nullable: true })
  profileUrl: string;

  @Column({ nullable: true })
  followersCount: number;

  @Column({ nullable: true })
  followingCount: number;

  @Column({ nullable: true })
  postsCount: number;

  @Column()
  sourceNetwork: 'instagram' | 'facebook';

  @Column()
  sourceAccount: string;

  @ManyToOne(() => Company, (company) => company.socialLeads)
  company: Company;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
