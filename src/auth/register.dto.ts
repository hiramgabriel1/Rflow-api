import { IsEmail, IsString, MinLength, IsOptional, IsNumber, IsUrl } from 'class-validator';

export class CompanyDto {
  @IsString()
  organizationName: string;

  @IsUrl()
  @IsOptional()
  websiteURL?: string;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsNumber()
  @IsOptional()
  teamSize?: number;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  company?: CompanyDto;
}
