// 好友请求模型
import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../users/user.schema';

export type FriendRequestDocument = FriendRequest & Document;

@Schema({ timestamps: true })
export class FriendRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: User | Types.ObjectId; // 请求发送者
  
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  receiver: User | Types.ObjectId; // 请求接收者
  
  @Prop()
  message: string; // 验证消息/附言
  
  @Prop({ default: 'pending' })
  status: string; // 请求状态: 'pending', 'accepted', 'rejected', 'ignored'
}

export const FriendRequestSchema = SchemaFactory.createForClass(FriendRequest);

// 确保一个用户不能向同一用户发送多个未处理的请求
FriendRequestSchema.index(
  { sender: 1, receiver: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);