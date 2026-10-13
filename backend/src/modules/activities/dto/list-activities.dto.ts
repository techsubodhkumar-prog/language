import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class ListActivitiesDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  categoryId?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;
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
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radiusKm?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }) => (value === undefined ? 20 : value))
  limit = 20;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  @Transform(({ value }) => (value === undefined ? 0 : value))
  offset = 0;
}
