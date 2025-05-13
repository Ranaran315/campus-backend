import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MinLength,
  Matches,
  IsMongoId,
  IsNumber,
  Min,
  Max,
  IsInt,
} from 'class-validator';

export class CreateAcademicClassDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string; // e.g., "软件工程2021级1班"

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Class ID must be uppercase letters, numbers, or underscores.',
  })
  classId?: string; // e.g., "SWE2101"

  @IsMongoId()
  @IsNotEmpty()
  major: string; // ObjectId of the Major

  // college will be derived from the major in the service

  @IsNumber()
  @IsNotEmpty()
  @IsInt()
  @Min(2000)
  @Max(2100) // Assuming a reasonable range for entry year
  entryYear: number; // e.g., 2021

  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(2000)
  @Max(2150) // Assuming a reasonable range for graduation year
  graduationYear?: number;

  @IsOptional()
  @IsMongoId()
  counselor?: string; // ObjectId of the User (counselor)

  @IsOptional()
  @IsMongoId()
  classMonitor?: string; // ObjectId of the User (classMonitor)

  @IsOptional()
  @IsString()
  remarks?: string;
}
