import { IsOptional, IsString, IsIn, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetMyCreatedInformsDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: string = 'updatedAt'; // Valid fields: title, status, updatedAt, publishAt, importance

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsIn(['draft', 'published', 'archived', 'all'])
  status?: 'draft' | 'published' | 'archived' | 'all' = 'all';

  @IsOptional()
  @IsString()
  searchQuery?: string;
}
