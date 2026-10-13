import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SendMessageDto {
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  @MinLength(1, { message: 'Message must be at least 1 character' })
  @MaxLength(2000, { message: 'Message cannot exceed 2000 characters' })
  content!: string;
}
