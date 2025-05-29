import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ChatGroupDocument = ChatGroup & Document;

@Schema({ timestamps: true })
export class ChatGroup {
  @Prop({ required: true })
  name: string;
  
  @Prop({ type: String })
  description?: string;
  
  @Prop({ type: String })
  avatar?: string;
  
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  owner: Types.ObjectId; // 群主
  
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
  members: Types.ObjectId[]; // 成员列表
  
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  admins: Types.ObjectId[]; // 管理员列表
  
  @Prop({ default: 200 })
  maxMembers: number; // 最大成员数
  
  @Prop({ type: Boolean, default: false })
  isPublic: boolean; // 是否公开群组
  
  @Prop({ default: false })
  isDeleted: boolean; // 软删除标记
}

export const ChatGroupSchema = SchemaFactory.createForClass(ChatGroup);

// 创建索引
ChatGroupSchema.index({ owner: 1 }); // 查询用户创建的群
ChatGroupSchema.index({ members: 1 }); // 查询用户所在的群
ChatGroupSchema.index({ name: 'text', description: 'text' }); // 全文搜索