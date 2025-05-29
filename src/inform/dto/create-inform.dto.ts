// filepath: d:\大学资料\论文毕设\毕设\campus-backend\src\inform\dto\create-inform.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsEnum,
  IsBoolean,
  IsDateString,
  MaxLength,
  IsMongoId, // Import MaxLength
} from 'class-validator';
import { Type } from 'class-transformer';

class InformAttachmentDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  url: string; // 通常是上传后得到的 URL

  @IsOptional()
  size?: number;

  @IsOptional()
  @IsString()
  mimetype?: string;

  @IsOptional()
  status?: string;
}

export class CreateInformDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100) // Example: Max length for title
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(250) // Max length for description
  description?: string; // Added description field

  @IsEnum([
    'ALL',
    'ROLE',
    'COLLEGE',
    'MAJOR',
    'ACADEMIC_CLASS',
    'SPECIFIC_USERS',
    'SENDER_OWN_CLASS',
    'SENDER_MANAGED_CLASSES',
    'SENDER_COLLEGE_STUDENTS',
  ])
  @IsOptional()
  targetScope?: string;

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  targetUsers?: string[]; // 已修改为与Schema一致的名称

  @IsEnum(['student', 'staff', 'all'])
  @IsOptional()
  userTypeFilter?: 'student' | 'staff' | 'all';

  @IsEnum(['high', 'medium', 'low'])
  @IsNotEmpty()
  importance: string;

  @IsArray()
  @IsOptional()
  tags?: string[]; // 原 category 字段，重命名为 tag 更简洁

  @IsBoolean()
  @IsOptional()
  allowReplies?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InformAttachmentDto)
  @IsOptional()
  attachments?: InformAttachmentDto[];

  @IsDateString()
  @IsOptional()
  publishAt?: Date; // 如果不提供，则立即发布 (或默认为创建时间)

  @IsDateString()
  @IsOptional()
  deadline?: string;

  @IsEnum(['draft', 'published']) // 创建时通常是草稿或直接发布
  @IsOptional()
  status?: 'draft' | 'published';

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean; // Added isPublic field

  @IsOptional()
  @IsBoolean()
  trackReadStatus?: boolean; // 是否跟踪阅读状态

  @IsOptional()
  @IsBoolean()
  requireConfirm?: boolean; // 是否需要确认
}
