import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema'; // 确保路径正确

export type InformDocument = Inform & Document;

@Schema({ timestamps: true })
export class Inform {
  @Prop({ required: true, trim: true, index: true })
  title: string;

  @Prop({ required: true })
  content: string; // 支持富文本或 Markdown

  @Prop({ trim: true }) // Optional description
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: [
      'ALL',
      'ROLE',
      'COLLEGE',
      'MAJOR',
      'ACADEMIC_CLASS',
      'SPECIFIC_USERS',
      'SENDER_OWN_CLASS',
      'SENDER_MANAGED_CLASSES',
      'SENDER_COLLEGE_STUDENTS',
    ],
  })
  targetScope: string;

  @Prop({ type: [String], default: [] })
  targetIds: string[];

  @Prop({
    type: String,
    enum: ['student', 'staff', 'all'],
    required: false,
  })
  userTypeFilter?: 'student' | 'staff' | 'all';

  @Prop({
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
  })
  importance: string;

  @Prop({ trim: true })
  tags?: string[];

  @Prop({ type: Boolean, default: false })
  allowReplies: boolean;

  @Prop({ type: Boolean, default: false })
  requireConfirm: boolean;

  @Prop({ type: Date })
  deadline?: Date;

  @Prop({ type: Boolean, default: false })
  trackReadStatus: boolean; // 是否跟踪阅读状态

  @Prop({
    type: [
      {
        fileName: String,
        url: String,
        size: Number,
        mimeType: String,
        _id: false,
      },
    ],
    default: [],
  })
  attachments: {
    fileName: string;
    url: string;
    size?: number;
    mimeType?: string;
  }[];

  @Prop({ default: () => new Date() })
  publishAt: Date;

  @Prop({
    type: String,
    required: true,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
    index: true,
  })
  status: string;

  @Prop({ type: Boolean, default: false })
  isEdited: boolean;

  @Prop({ type: Date })
  lastEditedAt?: Date;

  @Prop({ type: Number, default: 0 })
  editCount: number;

  // 可选：用于查询优化的作用域键，例如 "CLASS:SWE2101"
  @Prop({ type: String, index: true })
  receiverScopeKey?: string;

  @Prop({ type: Boolean, default: false })
  isPublic: boolean;

  @Prop()
  archivedAt: Date;

  @Prop()
  lastRevokeAt: Date;
}

export const InformSchema = SchemaFactory.createForClass(Inform);

// 考虑为常用查询字段添加索引，例如:
InformSchema.index({ status: 1, publishAt: -1 }); // 用于按状态和发布时间排序查询
InformSchema.index({ targetType: 1 });
