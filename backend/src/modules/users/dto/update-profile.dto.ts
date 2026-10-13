import { IsString, IsOptional, MinLength, MaxLength, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2, { message: 'Display name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Display name cannot exceed 50 characters' })
  displayName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(300, { message: 'Bio cannot exceed 300 characters' })
  bio?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(500, { message: 'Avatar URL cannot exceed 500 characters' })
  avatarUrl?: string;
}
