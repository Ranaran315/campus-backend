import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { UploadFile } from 'src/types/upload-file';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;
  
  @Prop({ type: Types.ObjectId, ref: 'User' })
  receiver?: Types.ObjectId; // 私聊时使用
  
  @Prop({ type: Types.ObjectId, ref: 'ChatGroup' })
  group?: Types.ObjectId; // 群聊时使用
  
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversation: Types.ObjectId; // 所属会话
  
  @Prop({ 
    required: true, 
    enum: ['text', 'image', 'file', 'audio', 'video', 'system']
  })
  type: string;
  
  @Prop({ required: true })
  content: string;
  
  @Prop({ type: [{ type: Object }] })
  attachments?: Array<UploadFile>;
  
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
  readBy: Types.ObjectId[]; // 已读用户列表
  
  @Prop({ default: false })
  isDeleted: boolean; // 软删除标记
  
  @Prop({ type: Object })
  metadata?: Record<string, any>; // 扩展字段，如引用消息ID等
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// 创建复合索引
MessageSchema.index({ conversation: 1, createdAt: -1 }); // 会话消息查询
MessageSchema.index({ sender: 1, createdAt: -1 }); // 用户发送的消息
MessageSchema.index({ receiver: 1, createdAt: -1 }); // 用户收到的消息
MessageSchema.index({ group: 1, createdAt: -1 }); // 群组消息