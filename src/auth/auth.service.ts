import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { Company } from '../entities/company.entity';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email, password: dto.password },
      relations: { company: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user);
  }

  async register(dto: RegisterDto) {
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException('Email already registered');
    }

    let company: Company | null = null;
    if (dto.company) {
      company = this.companyRepo.create(dto.company);
      await this.companyRepo.save(company);
    }

    const user = this.userRepo.create({
      email: dto.email,
      password: dto.password,
    });
    if (company) {
      user.company = company;
    }
    await this.userRepo.save(user);

    return this.generateTokens(user);
  }

  private async generateTokens(user: User) {
    const payload: any = { sub: user.id, email: user.email };
    if (user.company) {
      payload.companyId = user.company.id;
    }

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

    const refreshToken = randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const rt = this.refreshTokenRepo.create({
      token: refreshToken,
      expiresAt,
      user,
    });
    await this.refreshTokenRepo.save(rt);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        companyId: user.company?.id || null,
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    const stored = await this.refreshTokenRepo.findOne({
      where: { token: refreshToken, revoked: false },
      relations: { user: { company: true } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.refreshTokenRepo.update({ id: stored.id }, { revoked: true });

    const payload: any = { sub: stored.user.id, email: stored.user.email };
    if (stored.user.company) {
      payload.companyId = stored.user.company.id;
    }

    const newAccessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

    const newRefreshToken = randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const rt = this.refreshTokenRepo.create({
      token: newRefreshToken,
      expiresAt,
      user: stored.user,
    });
    await this.refreshTokenRepo.save(rt);

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    await this.refreshTokenRepo.update({ token: refreshToken }, { revoked: true });
    return { message: 'Logged out successfully' };
  }
}
