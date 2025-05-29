import {
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;
  
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
  
  @IsOptional()
  @IsString()
  avatar?: string;
} 