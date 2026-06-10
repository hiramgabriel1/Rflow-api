import { Body, Controller, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { CompanyContextService } from './company-context.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('company-context')
@UseGuards(JwtAuthGuard)
export class CompanyContextController {
  constructor(private readonly companyContextService: CompanyContextService) {}

  @Post('analyze')
  async analyzeCompany(@Body('url') url: string, @Req() req: any) {
    if (!url) {
      throw new BadRequestException('URL is required');
    }
    return this.companyContextService.analyzeCompany(req.user.userId, url);
  }
}
