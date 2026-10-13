import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  token!: string;

  @IsOptional()
  @IsString()
  @IsIn(['android', 'ios', 'web'])
  deviceType?: 'android' | 'ios' | 'web' = 'android';
}

export class RemoveDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
