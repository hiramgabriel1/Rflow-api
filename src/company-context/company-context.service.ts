import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

@Injectable()
export class CompanyContextService {
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn('⚠️ OPENAI_API_KEY not set. Company context analysis will not work.');
    }
  }

  async analyzeCompany(userId: string, url: string) {
    const company = await this.companyRepo.findOne({
      where: { users: { id: userId } },
    });

    if (!company) {
      throw new NotFoundException('Company not found for this user');
    }

    if (!url) {
      throw new BadRequestException('URL is required');
    }

    const content = await this.scrapeWebsite(url);
    if (!content) {
      throw new BadRequestException('Could not extract content from the URL');
    }

    const chunks = this.chunkContent(content);
    const context = await this.analyzeWithAI(chunks, company);

    company.contextCompany = context;
    await this.companyRepo.save(company);

    return {
      message: 'Company context analyzed and saved successfully',
      contextCompany: context,
    };
  }

  private async scrapeWebsite(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CompanyContextBot/1.0)',
        },
        timeout: 15000,
        maxContentLength: 5 * 1024 * 1024,
      });

      const $ = cheerio.load(response.data);

      $('script, style, nav, footer, header, noscript, iframe, svg').remove();

      const textParts: string[] = [];

      $('h1, h2, h3, h4, h5, h6').each((_, el) => {
        const heading = $(el).text().trim();
        if (heading) textParts.push(`\n## ${heading}\n`);
      });

      $('p, li, td, th, blockquote').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 20) {
          textParts.push(text);
        }
      });

      $('[class*="hero"], [class*="feature"], [class*="about"], [class*="service"], [class*="product"], [class*="pricing"], [class*="faq"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 50) {
          textParts.push(text);
        }
      });

      const metaDesc = $('meta[name="description"]').attr('content');
      if (metaDesc) textParts.unshift(`Description: ${metaDesc}`);

      const title = $('title').text().trim();
      if (title) textParts.unshift(`Title: ${title}`);

      return textParts.filter(Boolean).join('\n\n');
    } catch {
      return '';
    }
  }

  private chunkContent(content: string, maxChunkSize = 3000): string[] {
    const sentences = content.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += sentence + ' ';
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private async analyzeWithAI(chunks: string[], company: Company): Promise<string> {
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const companyInfo = `Company: ${company.organizationName || 'Unknown'}\nIndustry: ${company.industry || 'Unknown'}\nWebsite: ${company.websiteURL || 'Unknown'}`;

    const systemPrompt = `You are a business analyst AI. Your task is to analyze company website content and create a comprehensive summary.

Analyze the following aspects:
1. What the company does (products/services)
2. Target audience/customers
3. Value proposition
4. Key features or offerings
5. Market positioning
6. Competitors or alternatives mentioned
7. Tone and brand voice

Provide a structured, concise summary that can be used as context for AI assistants helping this company.`;

    const chunkAnalyses: string[] = [];

    for (const chunk of chunks) {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this content from the company website:\n\n${chunk}` },
        ],
        max_tokens: 500,
      });

      const analysis = response.choices[0]?.message?.content;
      if (analysis) {
        chunkAnalyses.push(analysis);
      }
    }

    const combinedAnalyses = chunkAnalyses.join('\n\n---\n\n');

    const finalResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here are analyses from different parts of the company website. Create a unified, comprehensive summary:\n\n${companyInfo}\n\n---\n\n${combinedAnalyses}` },
      ],
      max_tokens: 1500,
    });

    return finalResponse.choices[0]?.message?.content || 'No analysis generated';
  }
}
