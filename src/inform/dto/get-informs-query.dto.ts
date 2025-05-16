import { Transform } from 'class-transformer';
import { IsOptional, IsInt, Min, IsEnum, IsString } from 'class-validator';

export enum InformStatusQuery {
  ALL = 'all',
  READ = 'read',
  UNREAD = 'unread',
}

export enum InformSortByQuery {
  RECEIVED_AT = 'receivedAt', // Default sort by when the user received it
  PUBLISH_AT = 'publishAt', // Sort by when the inform was originally published
  IMPORTANCE = 'importance',
  DEADLINE = 'deadline', // Added deadline sort option
}

export enum SortOrderQuery {
  ASC = 'asc',
  DESC = 'desc',
}

export class GetInformsQueryDto {
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
  @IsEnum(InformStatusQuery)
  status?: InformStatusQuery = InformStatusQuery.ALL;

  @IsOptional()
  @IsString()
  @IsEnum(['high', 'medium', 'low'])
  importance?: 'high' | 'medium' | 'low';

  @IsOptional()
  @IsEnum(InformSortByQuery)
  sortBy?: InformSortByQuery = InformSortByQuery.RECEIVED_AT;

  @IsOptional()
  @IsEnum(SortOrderQuery)
  sortOrder?: SortOrderQuery = SortOrderQuery.DESC;
}
