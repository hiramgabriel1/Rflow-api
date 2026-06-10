import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SeederModule } from './seeder/seeder.module';
import { User } from './entities/user.entity';
import { Company } from './entities/company.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationsModule } from './conversations/conversations.module';
import { CompanyContextModule } from './company-context/company-context.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'rflow',
      password: process.env.DB_PASS || 'rflow_pass',
      database: process.env.DB_NAME || 'rflow_db',
      entities: [User, Company, RefreshToken, Conversation],
      synchronize: true,
    }),
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      ttl: 300,
    }),
    AuthModule,
    UsersModule,
    SeederModule,
    ConversationsModule,
    CompanyContextModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
