import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(3)
  @MaxLength(100)
  title?: string;
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(2000)
  description?: string;
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(50)
  categoryId?: string;
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(150)
  locationName?: string;
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(500)
  locationDescription?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  startsAt?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  endsAt?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxParticipants?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  minParticipants?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  estimatedCost?: number;
  @IsOptional()
  @IsIn(['public', 'invite_only'])
  visibility?: 'public' | 'invite_only';
  @IsOptional()
  @IsIn(['approval', 'auto_join'])
  joinPolicy?: 'approval' | 'auto_join';
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;
}
