import { Body, Controller, Post, Get, Delete, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { SocialScrapingService } from './social-scraping.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('social-scraping')
@UseGuards(JwtAuthGuard)
export class SocialScrapingController {
  constructor(private readonly socialScrapingService: SocialScrapingService) {}

  @Post('scrape')
  async scrapeFollowers(
    @Body('username') username: string,
    @Body('network') network: 'instagram' | 'facebook',
    @Body('limit') limit: number,
    @Req() req: any,
  ) {
    if (!username) {
      throw new BadRequestException('Username is required');
    }
    if (!network || !['instagram', 'facebook'].includes(network)) {
      throw new BadRequestException('Network must be instagram or facebook');
    }
    return this.socialScrapingService.scrapeFollowers(req.user.userId, username, network, limit || 100);
  }

  @Get('leads')
  async getLeads(
    @Req() req: any,
    @Query('network') network?: 'instagram' | 'facebook',
    @Query('sourceAccount') sourceAccount?: string,
  ) {
    return this.socialScrapingService.getLeads(req.user.userId, network, sourceAccount);
  }

  @Get('leads/:id')
  async getLeadById(@Param('id') id: string, @Req() req: any) {
    return this.socialScrapingService.getLeadById(req.user.userId, id);
  }

  @Delete('leads/:id')
  async deleteLead(@Param('id') id: string, @Req() req: any) {
    return this.socialScrapingService.deleteLead(req.user.userId, id);
  }

  @Delete('leads')
  async deleteLeadsBySource(
    @Query('network') network: 'instagram' | 'facebook',
    @Query('sourceAccount') sourceAccount: string,
    @Req() req: any,
  ) {
    if (!network || !sourceAccount) {
      throw new BadRequestException('Network and sourceAccount are required');
    }
    return this.socialScrapingService.deleteLeadsBySource(req.user.userId, network, sourceAccount);
  }
}
