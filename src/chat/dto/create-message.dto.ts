import {
  IsString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Types } from 'mongoose';

// 复用你现有的 InformAttachmentDto
class MessageAttachmentDto {
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

export class CreateMessageDto {
  @IsEnum(['text', 'image', 'file', 'audio', 'video'])
  type: string;
  
  @IsString()
  @IsNotEmpty()
  content: string;
  
  @IsMongoId()
  @IsOptional()
  conversationId?: Types.ObjectId; // 现有会话ID
  
  @IsMongoId()
  @IsOptional()
  receiverId?: string; // 新私聊接收者ID
  
  @IsMongoId()
  @IsOptional()
  groupId?: string; // 群组ID
  
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentDto)
  @IsOptional()
  attachments?: MessageAttachmentDto[];
  
  @IsOptional()
  metadata?: Record<string, any>; // 额外元数据
}