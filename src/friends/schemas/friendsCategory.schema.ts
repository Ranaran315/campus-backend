import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type FriendCategoryDocument = FriendCategory & Document;

// 好友分类
@Schema({ timestamps: true })
export class FriendCategory {
  @Prop({ required: true, trim: true })
  name: string; // 分类名称

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: User | Types.ObjectId; // 创建此分类的用户ID

  @Prop({ type: Boolean, default: false, required: true }) // Added isDefault
  isDefault: boolean;
}

export const FriendCategorySchema =
  SchemaFactory.createForClass(FriendCategory);
//确保用户创建的分类名唯一
FriendCategorySchema.index({ user: 1, name: 1 }, { unique: true });
