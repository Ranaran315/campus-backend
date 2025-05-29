import {
  IsString,
  IsArray,
  IsOptional,
  IsMongoId,
  IsNotEmpty,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
  
  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;
  
  @IsString()
  @IsOptional()
  avatar?: string;
  
  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  members: string[];
}