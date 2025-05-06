// 好友请求模型
import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../users/user.schema';

export type FriendRequestDocument = FriendRequest & Document;

export enum FriendRequestStatus {
  PENDING = 'pending', // 等待处理
  ACCEPTED = 'accepted', // 已接受
  REJECTED = 'rejected', // 已拒绝
  IGNORED = 'ignored', // 已忽略
}

@Schema({ timestamps: true })
export class FriendRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: User | Types.ObjectId; // 请求发送者

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  receiver: User | Types.ObjectId; // 请求接收者

  @Prop()
  message: string; // 验证消息/附言

  @Prop({
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'ignored'],
    default: 'pending',
  }) // 使用 enum
  status: FriendRequestStatus; // 使用定义的类型

  @Prop({ type: Boolean, default: false })
  senderDeleted: boolean; // 标记发送方是否已删除此记录

  @Prop({ type: Boolean, default: false })
  receiverDeleted: boolean; // 标记接收方是否已删除此记录
}

export const FriendRequestSchema = SchemaFactory.createForClass(FriendRequest);

// 确保一个用户不能向同一用户发送多个未处理的请求
FriendRequestSchema.index(
  { sender: 1, receiver: 1, status: 1 },
  // 确保一个用户不能向同一用户发送多个未处理的请求
  // 如果希望唯一性约束只针对 'pending' 状态，则 partialFilterExpression 是正确的
  // 如果希望任何状态下 sender+receiver 都是唯一的（通常不是这样，因为可以有历史记录），则去掉 partialFilterExpression
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
