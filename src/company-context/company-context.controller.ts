import { Body, Controller, Post, Get, Delete, Param, Req, UseGuards, BadRequestException } from '@nestjs/common';
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

  @Post('analyze-competitor')
  async analyzeCompetitor(@Body('url') url: string, @Req() req: any) {
    if (!url) {
      throw new BadRequestException('Competitor URL is required');
    }
    return this.companyContextService.analyzeCompetitor(req.user.userId, url);
  }

  @Get('competitors')
  async getCompetitors(@Req() req: any) {
    return this.companyContextService.getCompetitors(req.user.userId);
  }

  @Get('competitors/:id')
  async getCompetitorById(@Param('id') id: string, @Req() req: any) {
    return this.companyContextService.getCompetitorById(req.user.userId, id);
  }

  @Delete('competitors/:id')
  async deleteCompetitor(@Param('id') id: string, @Req() req: any) {
    return this.companyContextService.deleteCompetitor(req.user.userId, id);
  }
}
