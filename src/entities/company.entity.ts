import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
