import { IsArray, IsString, ArrayMaxSize, MaxLength } from 'class-validator';

export class UpdateUserInterestsDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true, message: 'Interest IDs cannot exceed 50 characters' })
  @ArrayMaxSize(30, { message: 'Cannot select more than 30 interests' })
  interestIds!: string[];
}
