// friend-relation.schema.ts
import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../users/user.schema';

export type FriendRelationDocument = FriendRelation & Document;

@Schema({ timestamps: true })
export class FriendRelation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: User | Types.ObjectId; // 用户ID
  
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  friend: User | Types.ObjectId; // 好友ID
  
  @Prop({ default: '' })
  remark: string; // 好友备注名

  @Prop({ default: 'accepted' })
  status: string; // 好友关系状态: 'pending', 'accepted', 'blocked'
  
//   @Prop({ default: 'default' })
//   category: string; // 好友分组/分类
  
//   @Prop({ default: false })
//   isFavorite: boolean; // 是否为特别/星标好友

}

export const FriendRelationSchema = SchemaFactory.createForClass(FriendRelation);

// 创建复合索引确保关系的唯一性
FriendRelationSchema.index({ user: 1, friend: 1 }, { unique: true });