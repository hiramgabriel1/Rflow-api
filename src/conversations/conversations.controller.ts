import { Body, Controller, Get, Post, Req, Delete, UseGuards, BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post('init')
  async init(@Req() req: any) {
    return this.conversationsService.createConversation(req.user.userId);
  }

  @Post('message')
  async sendMessage(@Body('content') content: string, @Req() req: any) {
    if (!content) {
      throw new BadRequestException('Content is required');
    }
    return this.conversationsService.sendMessage(req.user.userId, content);
  }

  @Get()
  async getConversation(@Req() req: any) {
    return this.conversationsService.getConversation(req.user.userId);
  }

  @Delete()
  async clearConversation(@Req() req: any) {
    return this.conversationsService.clearConversation(req.user.userId);
  }
}
