import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MinLength,
  Matches,
  IsMongoId,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateMajorDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Major ID must be uppercase letters, numbers, or underscores.',
  })
  majorId?: string;

  @IsMongoId()
  @IsNotEmpty()
  college: string; // ObjectId of the College

  @IsOptional()
  @IsString()
  degreeOffered?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationYears?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
