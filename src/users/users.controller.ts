import { Controller, Get, UseGuards, UseInterceptors, Req } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
@UseInterceptors(CacheInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: any) {
    if (!req.user.companyId) {
      return { message: 'No company associated' };
    }
    return this.usersService.getCompanyData(req.user.companyId);
  }
}
