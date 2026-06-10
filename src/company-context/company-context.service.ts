import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { CompetitorCompany } from '../entities/competitor-company.entity';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

@Injectable()
export class CompanyContextService {
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(CompetitorCompany)
    private readonly competitorRepo: Repository<CompetitorCompany>,
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

  async analyzeCompetitor(userId: string, competitorUrl: string) {
    const company = await this.companyRepo.findOne({
      where: { users: { id: userId } },
    });

    if (!company) {
      throw new NotFoundException('Company not found for this user');
    }

    if (!competitorUrl) {
      throw new BadRequestException('Competitor URL is required');
    }

    if (!company.contextCompany) {
      throw new BadRequestException('You must analyze your company context first. Call /company-context/analyze with your company URL.');
    }

    const existing = await this.competitorRepo.findOne({
      where: { company: { id: company.id }, url: competitorUrl },
    });
    if (existing) {
      throw new BadRequestException('This competitor has already been analyzed');
    }

    const competitorContent = await this.scrapeWebsite(competitorUrl);
    if (!competitorContent) {
      throw new BadRequestException('Could not extract content from the competitor URL');
    }

    const competitorChunks = this.chunkContent(competitorContent);
    const competitorAnalysis = await this.analyzeCompetitorContent(competitorChunks);

    const comparison = await this.compareCompanies(company.contextCompany, competitorAnalysis, competitorUrl);

    const competitorName = competitorUrl.replace(/https?:\/\//, '').split('/')[0];

    const competitor = this.competitorRepo.create({
      name: competitorName,
      url: competitorUrl,
      content: competitorContent.substring(0, 10000),
      analysis: competitorAnalysis,
      comparison,
      company,
    });
    await this.competitorRepo.save(competitor);

    return {
      message: 'Competitor analysis completed',
      competitor: {
        id: competitor.id,
        name: competitor.name,
        url: competitor.url,
        comparison: competitor.comparison,
        createdAt: competitor.createdAt,
      },
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

  private async analyzeCompetitorContent(chunks: string[]): Promise<string> {
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const systemPrompt = `You are a business analyst AI. Analyze this competitor company website content and create a comprehensive summary.

Focus on:
1. Products/services offered
2. Target market
3. Value proposition
4. Pricing strategy (if mentioned)
5. Key differentiators
6. Marketing approach
7. Strengths and weaknesses observed

Provide a structured summary.`;

    const chunkAnalyses: string[] = [];

    for (const chunk of chunks) {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this competitor website content:\n\n${chunk}` },
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
        { role: 'user', content: `Combine these competitor analyses into a unified summary:\n\n${combinedAnalyses}` },
      ],
      max_tokens: 1500,
    });

    return finalResponse.choices[0]?.message?.content || 'No analysis generated';
  }

  private async compareCompanies(myCompanyContext: string, competitorAnalysis: string, competitorUrl: string): Promise<string> {
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const systemPrompt = `You are a strategic business consultant AI. Compare my company against a competitor and provide actionable insights.

Provide:
1. **Strengths vs Competitor** - Where my company has advantages
2. **Weaknesses vs Competitor** - Where the competitor is stronger
3. **Opportunities** - Specific actions I should take to gain advantage
4. **Threats** - What the competitor does that could hurt my business
5. **Recommendations** - Concrete, prioritized action items

Be specific, practical, and direct. Use examples from both companies.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `MY COMPANY CONTEXT:\n${myCompanyContext}\n\n---\n\nCOMPETITOR (${competitorUrl}):\n${competitorAnalysis}\n\n---\n\nNow compare both companies and give me a detailed competitive analysis with actionable recommendations.`,
        },
      ],
      max_tokens: 2000,
    });

    return response.choices[0]?.message?.content || 'No comparison generated';
  }

  async getCompetitors(userId: string) {
    const company = await this.companyRepo.findOne({
      where: { users: { id: userId } },
    });

    if (!company) {
      throw new NotFoundException('Company not found for this user');
    }

    const competitors = await this.competitorRepo.find({
      where: { company: { id: company.id } },
      order: { createdAt: 'DESC' },
    });

    return competitors.map(c => ({
      id: c.id,
      name: c.name,
      url: c.url,
      comparison: c.comparison,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getCompetitorById(userId: string, competitorId: string) {
    const company = await this.companyRepo.findOne({
      where: { users: { id: userId } },
    });

    if (!company) {
      throw new NotFoundException('Company not found for this user');
    }

    const competitor = await this.competitorRepo.findOne({
      where: { id: competitorId, company: { id: company.id } },
    });

    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }

    return {
      id: competitor.id,
      name: competitor.name,
      url: competitor.url,
      content: competitor.content,
      analysis: competitor.analysis,
      comparison: competitor.comparison,
      createdAt: competitor.createdAt,
      updatedAt: competitor.updatedAt,
    };
  }

  async deleteCompetitor(userId: string, competitorId: string) {
    const company = await this.companyRepo.findOne({
      where: { users: { id: userId } },
    });

    if (!company) {
      throw new NotFoundException('Company not found for this user');
    }

    const competitor = await this.competitorRepo.findOne({
      where: { id: competitorId, company: { id: company.id } },
    });

    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }

    await this.competitorRepo.remove(competitor);
    return { deleted: true, competitorId };
  }
}
