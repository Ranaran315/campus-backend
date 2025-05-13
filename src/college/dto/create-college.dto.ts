import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateCollegeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'College ID must be uppercase letters, numbers, or underscores.',
  })
  collegeId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  dean?: string;

  @IsOptional()
  @IsString()
  // @IsEmail() // Consider adding IsEmail if strict email format is required
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;
}
