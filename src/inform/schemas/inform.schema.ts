import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/user.schema'; // 确保路径正确

export type InformDocument = Inform & Document;

@Schema({ timestamps: true }) // createdAt 和 updatedAt 会自动添加
export class Inform {
  @Prop({ required: true, trim: true, index: true })
  title: string;

  @Prop({ required: true })
  content: string; // 支持富文本或 Markdown

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderId: Types.ObjectId; // 发送者用户ID

  @Prop({
    type: String,
    required: true,
    enum: [
      'ALL', // 全体
      'ROLE', // 按角色
      'COLLEGE', // 按学院
      'MAJOR', // 按专业
      'ACADEMIC_CLASS', // 按班级
      'SPECIFIC_USERS', // 特定用户
      'SENDER_OWN_CLASS', // 发送者所在班级 (学生)
      'SENDER_MANAGED_CLASSES', // 发送者管理的所有班级 (教职工)
      'SENDER_COLLEGE_STUDENTS', // 发送者所在学院的所有学生 (教职工/学生均可适用，后端解析)
      // 可以根据需要添加更多一键派发类型
    ],
  })
  targetType: string;

  @Prop({ type: [String], default: [] }) // 存储角色名/ID、学院ID、专业ID、班级ID、用户ID列表
  targetIds: string[];

  @Prop({
    type: String,
    enum: ['student', 'staff', 'all'], // 注意：Mongoose 枚举值不能是 null 或 undefined
    required: false, // 设为 false，因为并非所有 targetType 都需要它
  })
  userTypeFilter?: 'student' | 'staff' | 'all';

  @Prop({
    type: String,
    required: true,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
  })
  importance: string;

  @Prop({ trim: true })
  tag?: string; // 通知标签，例如 “教务通知”、“学工通知”

  @Prop({ type: Boolean, default: false }) // 默认为不允许回复，根据需求调整
  allowReplies: boolean;

  @Prop({
    type: [
      {
        fileName: String,
        url: String,
        size: Number,
        mimeType: String,
        _id: false, // 通常不需要为子文档数组中的对象生成 _id
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

  @Prop({ default: () => new Date() }) // 默认为当前时间
  publishAt: Date; // 发布时间，可以是预定发布时间

  @Prop()
  deadline?: Date; // 例如需要回复或提交材料的截止日期

  @Prop({
    type: String,
    required: true,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
    index: true,
  })
  status: string;

  @Prop({ type: Boolean, default: false })
  isEdited: boolean; // 标记此通知是否被编辑过

  @Prop({ type: Date })
  lastEditedAt?: Date; // 最后编辑时间

  @Prop({ type: Number, default: 0 })
  editCount: number; // 编辑次数
}

export const InformSchema = SchemaFactory.createForClass(Inform);

// 考虑为常用查询字段添加索引，例如:
InformSchema.index({ status: 1, publishAt: -1 }); // 用于按状态和发布时间排序查询
InformSchema.index({ targetType: 1 });
