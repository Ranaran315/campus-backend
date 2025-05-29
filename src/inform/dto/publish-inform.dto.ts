import {
  IsString,
  IsEnum,
  IsArray,
  IsOptional,
  IsMongoId,
  IsNotEmpty,
  IsDateString,
  IsBoolean,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// 复用 InformAttachmentDto 类型定义
class InformAttachmentDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  size?: number;
}

export class PublishInformDto {
  // 目标范围相关字段
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
  targetUsers?: string[];

  @IsEnum(['student', 'staff', 'all'])
  @IsOptional()
  userTypeFilter?: 'student' | 'staff' | 'all';

  // 通知内容相关字段
  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;

  @IsEnum(['high', 'medium', 'low'])
  @IsOptional()
  importance?: string;

  @IsArray()
  @IsOptional()
  tags?: string[];

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
  deadline?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  trackReadStatus?: boolean;

  @IsBoolean()
  @IsOptional()
  requireConfirm?: boolean;
}
