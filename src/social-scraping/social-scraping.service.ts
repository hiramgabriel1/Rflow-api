import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { SocialLead } from '../entities/social-lead.entity';
import puppeteer from 'puppeteer';

@Injectable()
export class SocialScrapingService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(SocialLead)
    private readonly socialLeadRepo: Repository<SocialLead>,
  ) {}

  async scrapeFollowers(userId: string, targetUsername: string, network: 'instagram' | 'facebook', limit = 100) {
    const company = await this.companyRepo.findOne({
      where: { users: { id: userId } },
    });

    if (!company) {
      throw new NotFoundException('Company not found for this user');
    }

    if (!targetUsername) {
      throw new BadRequestException('Target username is required');
    }

    if (!['instagram', 'facebook'].includes(network)) {
      throw new BadRequestException('Network must be instagram or facebook');
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      if (network === 'instagram') {
        return await this.scrapeInstagramPublic(page, company, targetUsername, limit);
      } else {
        return await this.scrapeFacebookPublic(page, company, targetUsername, limit);
      }
    } finally {
      await browser.close();
    }
  }

  private async scrapeInstagramPublic(page: any, company: Company, username: string, limit: number) {
    const profileUrl = `https://www.instagram.com/${username}/`;

    await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('main, body', { timeout: 10000 }).catch(() => null);

    const profileData = await page.evaluate(() => {
      const meta = document.querySelectorAll('meta');
      let followersCount = 0;
      let followingCount = 0;
      let postsCount = 0;
      let fullName = '';
      let bio = '';

      meta.forEach((m: any) => {
        const content = m.getAttribute('content') || '';
        if (content.includes('Followers')) {
          const match = content.match(/(\d[\d,.]*)\s*Followers/);
          if (match) followersCount = parseInt(match[1].replace(/[,.]/g, ''));
        }
        if (content.includes('Following')) {
          const match = content.match(/(\d[\d,.]*)\s*Following/);
          if (match) followingCount = parseInt(match[1].replace(/[,.]/g, ''));
        }
        if (content.includes('Posts')) {
          const match = content.match(/(\d[\d,.]*)\s*Posts/);
          if (match) postsCount = parseInt(match[1].replace(/[,.]/g, ''));
        }
      });

      const h1 = document.querySelector('h1, h2');
      if (h1) fullName = h1.textContent || '';

      const descMeta = document.querySelector('meta[name="description"]');
      if (descMeta) bio = descMeta.getAttribute('content') || '';

      return { followersCount, followingCount, postsCount, fullName, bio };
    });

    console.log(`Profile @${username}: ${profileData.followersCount} followers, ${profileData.postsCount} posts`);

    const leads: SocialLead[] = [];
    const processedUsernames = new Set<string>();

    try {
      const postLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/p/"]'));
        const hrefs: string[] = [];
        for (const link of links) {
          const href = link.getAttribute('href');
          if (href && !hrefs.includes(href)) {
            hrefs.push(href);
          }
        }
        return hrefs.slice(0, 6);
      });

      console.log(`Found ${postLinks.length} public posts to scrape`);

      for (const postHref of postLinks) {
        if (leads.length >= limit) break;

        const postUrl = postHref.startsWith('http') ? postHref : `https://www.instagram.com${postHref}`;

        try {
          await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 15000 });
          await page.waitForSelector('main, body', { timeout: 5000 }).catch(() => null);
          await new Promise((r) => setTimeout(r, 1000));

          const commenters = await page.evaluate((maxComments: number) => {
            const users: Array<{ username: string; text: string }> = [];
            const seen = new Set<string>();
            const skip = ['explore','accounts','p','reels','stories','direct','notifications','settings','developer','about','press','help','privacy','terms','locations','language','meta','verified','business','remove','report','login','signup','challenge','tv'];

            const allLinks = Array.from(document.querySelectorAll('a'));
            for (const link of allLinks) {
              const href = link.getAttribute('href') || '';
              const match = href.match(/^\/([^/]+)\/?$/);
              if (match && !seen.has(match[1])) {
                const u = match[1];
                if (/^[a-zA-Z0-9._]+$/.test(u) && u.length > 1 && !skip.includes(u)) {
                  seen.add(u);
                  const commentEl = link.closest('li, div[role="button"], article');
                  const text = commentEl ? (commentEl.textContent || '').trim().substring(0, 200) : '';
                  users.push({ username: u, text });
                  if (users.length >= maxComments) break;
                }
              }
            }

            return users;
          }, Math.max(10, Math.ceil(limit / postLinks.length)));

          for (const commenter of commenters) {
            if (!commenter.username || processedUsernames.has(commenter.username)) continue;
            if (leads.length >= limit) break;

            processedUsernames.add(commenter.username);

            const existing = await this.socialLeadRepo.findOne({
              where: { username: commenter.username, sourceNetwork: 'instagram', sourceAccount: username },
            });

            if (existing) continue;

            let email: string | undefined;
            let phone: string | undefined;
            let bio: string | undefined;
            let followersC: number | undefined;
            let followingC: number | undefined;
            let postsC: number | undefined;
            let fullName: string | undefined;

            try {
              await page.goto(`https://www.instagram.com/${commenter.username}/`, { waitUntil: 'networkidle2', timeout: 10000 });
              await page.waitForSelector('main, body', { timeout: 3000 }).catch(() => null);

              const profileInfo = await page.evaluate(() => {
                let email = '';
                let phone = '';
                let bio = '';
                let fullName = '';
                let followers = 0;
                let following = 0;
                let posts = 0;

                const meta = document.querySelectorAll('meta');
                for (const m of Array.from(meta)) {
                  const content = m.getAttribute('content') || '';
                  if (content.includes('Followers')) {
                    const match = content.match(/(\d[\d,.]*)\s*Followers/);
                    if (match) followers = parseInt(match[1].replace(/[,.]/g, ''));
                  }
                  if (content.includes('Following')) {
                    const match = content.match(/(\d[\d,.]*)\s*Following/);
                    if (match) following = parseInt(match[1].replace(/[,.]/g, ''));
                  }
                  if (content.includes('Posts')) {
                    const match = content.match(/(\d[\d,.]*)\s*Posts/);
                    if (match) posts = parseInt(match[1].replace(/[,.]/g, ''));
                  }
                  if (m.getAttribute('name') === 'description') {
                    bio = content;
                  }
                }

                const h1 = document.querySelector('h1, h2');
                if (h1) fullName = h1.textContent || '';

                const bodyText = document.body.textContent || '';
                const emailMatch = bodyText.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
                if (emailMatch && !emailMatch[0].includes('instagram.com') && !emailMatch[0].includes('example.com')) {
                  email = emailMatch[0];
                }

                const phoneMatch = bodyText.match(/(\+?\d[\d\s\-\(\)]{7,}\d)/);
                if (phoneMatch) phone = phoneMatch[1];

                return { email, phone, bio, fullName, followers, following, posts };
              });

              email = profileInfo.email || undefined;
              phone = profileInfo.phone || undefined;
              bio = profileInfo.bio || undefined;
              fullName = profileInfo.fullName || undefined;
              followersC = profileInfo.followers || undefined;
              followingC = profileInfo.following || undefined;
              postsC = profileInfo.posts || undefined;
            } catch {
              // Profile visit failed
            }

            const leadData = {
              username: commenter.username,
              fullName: fullName || undefined,
              email: email || undefined,
              phone: phone || undefined,
              bio: bio || undefined,
              profileUrl: `https://www.instagram.com/${commenter.username}/`,
              followersCount: followersC,
              followingCount: followingC,
              postsCount: postsC,
              sourceNetwork: 'instagram' as const,
              sourceAccount: username,
              company,
            };

            const lead = this.socialLeadRepo.create(leadData);
            leads.push(lead);

            await new Promise((r) => setTimeout(r, 800 + Math.random() * 1500));
          }
        } catch (err) {
          console.log(`Error scraping post ${postUrl}:`, err);
        }
      }
    } catch (err) {
      console.log('Error in Instagram public scraping:', err);
    }

    if (leads.length > 0) {
      await this.socialLeadRepo.save(leads);
    }

    const withContact = leads.filter((l) => l.email || l.phone);

    return {
      message: `Scraped ${leads.length} users from @${username}'s posts. ${withContact.length} have email/phone.`,
      profile: {
        username,
        fullName: profileData.fullName,
        followersCount: profileData.followersCount,
        followingCount: profileData.followingCount,
        postsCount: profileData.postsCount,
      },
      leads: leads.map((l) => ({
        id: l.id,
        username: l.username,
        fullName: l.fullName,
        email: l.email,
        phone: l.phone,
        bio: l.bio,
        profileUrl: l.profileUrl,
        followersCount: l.followersCount,
      })),
      total: leads.length,
      withContactInfo: withContact.length,
    };
  }

  private async scrapeFacebookPublic(page: any, company: Company, username: string, limit: number) {
    const profileUrl = `https://www.facebook.com/${username}/`;

    await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('[role="main"]', { timeout: 10000 }).catch(() => null);

    const profileData = await page.evaluate(() => {
      const meta = document.querySelectorAll('meta');
      let likes = 0;
      let followers = 0;
      let fullName = '';

      meta.forEach((m: any) => {
        const content = m.getAttribute('content') || '';
        if (content.includes('likes')) {
          const match = content.match(/(\d[\d,.]*)\s*likes/);
          if (match) likes = parseInt(match[1].replace(/[,.]/g, ''));
        }
        if (content.includes('followers')) {
          const match = content.match(/(\d[\d,.]*)\s*followers/);
          if (match) followers = parseInt(match[1].replace(/[,.]/g, ''));
        }
      });

      const h1 = document.querySelector('h1');
      if (h1) fullName = h1.textContent || '';

      return { likes, followers, fullName };
    });

    return {
      message: `Facebook scraping requires login. Profile data extracted for @${username}`,
      profile: {
        username,
        fullName: profileData.fullName,
        likes: profileData.likes,
        followers: profileData.followers,
      },
      leads: [],
      total: 0,
      note: 'Facebook requires authentication to scrape followers. Use Facebook Graph API for full access.',
    };
  }

  async getLeads(userId: string, network?: 'instagram' | 'facebook', sourceAccount?: string) {
    const company = await this.companyRepo.findOne({
      where: { users: { id: userId } },
    });

    if (!company) {
      throw new NotFoundException('Company not found for this user');
    }

    const where: any = { company: { id: company.id } };
    if (network) where.sourceNetwork = network;
    if (sourceAccount) where.sourceAccount = sourceAccount;

    const leads = await this.socialLeadRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return leads.map((l) => ({
      id: l.id,
      username: l.username,
      fullName: l.fullName,
      email: l.email,
      phone: l.phone,
      bio: l.bio,
      profileUrl: l.profileUrl,
      followersCount: l.followersCount,
      followingCount: l.followingCount,
      postsCount: l.postsCount,
      sourceNetwork: l.sourceNetwork,
      sourceAccount: l.sourceAccount,
      createdAt: l.createdAt,
    }));
  }

  async getLeadById(userId: string, leadId: string) {
    const company = await this.companyRepo.findOne({
      where: { users: { id: userId } },
    });

    if (!company) {
      throw new NotFoundException('Company not found for this user');
    }

    const lead = await this.socialLeadRepo.findOne({
      where: { id: leadId, company: { id: company.id } },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  async deleteLead(userId: string, leadId: string) {
    const company = await this.companyRepo.findOne({
      where: { users: { id: userId } },
    });

    if (!company) {
      throw new NotFoundException('Company not found for this user');
    }

    const lead = await this.socialLeadRepo.findOne({
      where: { id: leadId, company: { id: company.id } },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    await this.socialLeadRepo.remove(lead);
    return { deleted: true, leadId };
  }

  async deleteLeadsBySource(userId: string, network: 'instagram' | 'facebook', sourceAccount: string) {
    const company = await this.companyRepo.findOne({
      where: { users: { id: userId } },
    });

    if (!company) {
      throw new NotFoundException('Company not found for this user');
    }

    const result = await this.socialLeadRepo.delete({
      company: { id: company.id },
      sourceNetwork: network,
      sourceAccount,
    });

    return { deleted: result.affected || 0, network, sourceAccount };
  }
}
