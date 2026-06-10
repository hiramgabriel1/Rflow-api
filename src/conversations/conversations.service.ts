import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import { Conversation } from '../entities/conversation.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class ConversationsService {
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn('⚠️ OPENAI_API_KEY not set. Chat will not work.');
    }
  }

  async createConversation(userId: string, title?: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const conversation = this.conversationRepo.create({
      user,
      title: title || 'New Conversation',
    });
    await this.conversationRepo.save(conversation);
    return conversation;
  }

  async getUserConversations(userId: string, page: number, limit: number) {
    const [conversations, total] = await this.conversationRepo.findAndCount({
      where: { user: { id: userId } },
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: conversations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getConversationById(conversationId: string, userId: string) {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, user: { id: userId } },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  async sendMessage(conversationId: string, content: string) {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    conversation.messages.push({ role: 'user', content });
    await this.conversationRepo.save(conversation);

    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversation.messages as any,
    });

    const assistantMessage = response.choices[0].message.content || '';
    conversation.messages.push({ role: 'assistant', content: assistantMessage });
    await this.conversationRepo.save(conversation);

    return {
      conversationId: conversation.id,
      messages: conversation.messages,
    };
  }

  async clearConversation(conversationId: string, userId: string) {
    const conversation = await this.getConversationById(conversationId, userId);
    conversation.messages = [];
    await this.conversationRepo.save(conversation);
    return conversation;
  }

  async deleteConversation(conversationId: string, userId: string) {
    const conversation = await this.getConversationById(conversationId, userId);
    await this.conversationRepo.remove(conversation);
    return { deleted: true, conversationId };
  }
}
