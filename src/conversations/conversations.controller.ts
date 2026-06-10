import { Body, Controller, Get, Post, Delete, Param, Req, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  async create(@Body('title') title: string, @Req() req: any) {
    return this.conversationsService.createConversation(req.user.userId, title);
  }

  @Get()
  async listAll(@Req() req: any, @Query('page') page: string = '1', @Query('limit') limit: string = '20') {
    return this.conversationsService.getUserConversations(req.user.userId, parseInt(page), parseInt(limit));
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: any) {
    return this.conversationsService.getConversationById(id, req.user.userId);
  }

  @Post(':id/message')
  async sendMessage(@Param('id') id: string, @Body('content') content: string, @Req() req: any) {
    if (!content) {
      throw new BadRequestException('Content is required');
    }
    return this.conversationsService.sendMessage(id, content);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    return this.conversationsService.deleteConversation(id, req.user.userId);
  }

  @Post(':id/clear')
  async clear(@Param('id') id: string, @Req() req: any) {
    return this.conversationsService.clearConversation(id, req.user.userId);
  }
}
