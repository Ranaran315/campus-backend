import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Conversation } from './conversation.schema';

export type UserConversationSettingDocument = UserConversationSetting & Document;

@Schema()
export class UserConversationSetting {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;
  
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversation: Types.ObjectId;
  
  @Prop({ default: false })
  isPinned: boolean; // 置顶
  
  @Prop({ default: true })
  isVisible: boolean; // 是否在会话列表显示
  
  @Prop({ default: 0 })
  unreadCount: number; // 未读消息计数
  
  @Prop({ default: null })
  lastReadMessageId?: Types.ObjectId; // 最后读取的消息ID
  
  @Prop({ default: false })
  isMuted: boolean; // 是否静音通知
  
  @Prop({ type: String, default: null })
  nickname?: string; // 用户对此会话的自定义名称
}

export const UserConversationSettingSchema = SchemaFactory.createForClass(UserConversationSetting);

// 创建复合唯一索引，确保每个用户对每个会话只有一个设置记录
UserConversationSettingSchema.index(
  { user: 1, conversation: 1 }, 
  { unique: true }
);