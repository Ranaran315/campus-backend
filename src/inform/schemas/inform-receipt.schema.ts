import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema'; // 确保路径正确
import { Inform } from './inform.schema'; // 确保路径正确

export type InformReceiptDocument = InformReceipt & Document;

@Schema({ timestamps: { createdAt: 'receivedAt', updatedAt: true } }) // receivedAt 作为创建时间，updatedAt 记录后续更新
export class InformReceipt {
  @Prop({ type: Types.ObjectId, ref: Inform.name, required: true, index: true })
  inform: Types.ObjectId; // 关联的通知ID

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  user: Types.ObjectId; // 接收用户ID

  @Prop({ type: Boolean, default: false, index: true }) // 添加索引方便查询未读通知
  isRead: boolean; // 是否已读

  @Prop({ type: Date })
  readAt?: Date; // 阅读时间

  @Prop({ type: Boolean, default: false })
  isPinned: boolean; // 用户是否置顶此通知
}

export const InformReceiptSchema = SchemaFactory.createForClass(InformReceipt);

// 复合唯一索引，确保同一用户对同一通知只有一条接收记录
InformReceiptSchema.index({ informId: 1, userId: 1 }, { unique: true });

// (可选) 为用户查询其通知列表时常用的字段添加索引
InformReceiptSchema.index({ userId: 1, isRead: 1, receivedAt: -1 }); // 用于查询某用户未读/已读通知并按接收时间排序
InformReceiptSchema.index({ userId: 1, isPinned: 1, receivedAt: -1 }); // 用于查询某用户置顶通知
