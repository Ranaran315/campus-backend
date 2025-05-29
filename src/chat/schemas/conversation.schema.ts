import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Message } from './message.schema';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ 
    type: String, 
    enum: ['private', 'group'], 
    required: true 
  })
  type: 'private' | 'group';
  
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
  participants: Types.ObjectId[]; // 参与者
  
  @Prop({ type: Types.ObjectId, ref: 'Message' })
  lastMessage?: Types.ObjectId; // 最后一条消息的引用
  
  @Prop({ type: Date })
  lastActivityAt: Date; // 最后活动时间
  
  @Prop({ type: Types.ObjectId, ref: 'ChatGroup' })
  group?: Types.ObjectId; // 如果是群聊，关联群信息
  
  @Prop({ default: false })
  isDeleted: boolean; // 软删除标记
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// 创建索引
ConversationSchema.index({ participants: 1 }); // 快速查询用户参与的会话
ConversationSchema.index({ group: 1 }, { unique: true, sparse: true }); // 群聊唯一会话
ConversationSchema.index({ lastActivityAt: -1 }); // 会话列表排序