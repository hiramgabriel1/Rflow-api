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

  async createConversation(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: { conversation: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.conversation) {
      return user.conversation;
    }

    const conversation = this.conversationRepo.create({ user });
    await this.conversationRepo.save(conversation);
    return conversation;
  }

  async sendMessage(userId: string, content: string) {
    let conversation = await this.conversationRepo.findOne({
      where: { user: { id: userId } },
      relations: { user: true },
    });

    if (!conversation) {
      conversation = await this.createConversation(userId);
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

  async getConversation(userId: string) {
    const conversation = await this.conversationRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!conversation) {
      return null;
    }

    return conversation;
  }

  async clearConversation(userId: string) {
    const conversation = await this.conversationRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    conversation.messages = [];
    await this.conversationRepo.save(conversation);
    return conversation;
  }
}
