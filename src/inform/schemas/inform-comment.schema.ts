import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/user.schema'; // 确保路径正确
import { Inform } from './inform.schema'; // 确保路径正确

export type InformCommentDocument = InformComment & Document;

@Schema({ timestamps: true }) // createdAt 和 updatedAt 会自动添加
export class InformComment {
  @Prop({ type: Types.ObjectId, ref: Inform.name, required: true, index: true })
  informId: Types.ObjectId; // 关联的通知ID

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId: Types.ObjectId; // 发表评论/提问的用户ID (可以是通知的发送者或任何接收者)

  @Prop({ type: String, required: true, trim: true })
  content: string; // 评论/提问的内容

  @Prop({
    type: Types.ObjectId,
    ref: 'InformComment', // 自我引用，用于实现回复链
    index: true,
    sparse: true, // 允许为 null，且 null 值不参与唯一性约束（如果未来有唯一性约束的话）
  })
  parentId?: Types.ObjectId; // “引用的消息”的ID，即被回复的评论的ID。如果不是回复，则此字段为空。

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
  }[]; // 评论中也可以带附件

  // (可选) 如果需要软删除评论的功能
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean; // 标记评论是否已被删除（软删除）

  @Prop({ type: Date })
  deletedAt?: Date; // 软删除的时间

  // createdAt 和 updatedAt 由 timestamps: true 自动管理
}

export const InformCommentSchema = SchemaFactory.createForClass(InformComment);

// 为常用查询添加索引
// 1. 查询某个通知下的所有评论，并按创建时间排序 (最常见的查询)
InformCommentSchema.index({ informId: 1, createdAt: 1 });

// 2. 如果经常需要查询某个通知下的一级评论 (parentId 为 null 或 undefined)
InformCommentSchema.index({ informId: 1, parentId: 1, createdAt: 1 }); // parentId: 1 会将 null/undefined 排在前面
