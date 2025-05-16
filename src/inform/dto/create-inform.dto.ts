// filepath: d:\大学资料\论文毕设\毕设\campus-backend\src\inform\dto\create-inform.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsMongoId,
  IsArray,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
  ValidateNested,
  ArrayMinSize,
  MaxLength,
  MinLength,
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
  @IsString()
  mimeType?: string;

  @IsOptional()
  size?: number;
}

export class CreateInformDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

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
  @IsNotEmpty()
  targetType: string;

  @IsArray()
  @IsMongoId({ each: true }) // 假设 targetIds 存储的是 ObjectId 字符串
  @IsOptional() // 对于 'ALL' 或 SENDER_* 类型，此字段可能为空
  targetIds?: string[];

  @IsEnum(['student', 'staff', 'all'])
  @IsOptional()
  userTypeFilter?: 'student' | 'staff' | 'all';

  @IsEnum(['high', 'medium', 'low'])
  @IsNotEmpty()
  importance: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  tag?: string; // 原 category 字段，重命名为 tag 更简洁

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
  deadline?: Date;

  @IsEnum(['draft', 'published']) // 创建时通常是草稿或直接发布
  @IsOptional()
  status?: 'draft' | 'published';
}
