import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CollegeDocument = College & Document;

@Schema({ timestamps: true })
export class College {
  @Prop({ required: true, unique: true, trim: true, index: true })
  name: string; // 例如 "计算机科学与技术学院"

  @Prop({ unique: true, sparse: true, trim: true }) // sparse: true 允许 null 值存在但不重复
  collegeId?: string; // 学院代码 (可选), 例如 "CS", "FL"

  @Prop({ trim: true })
  description?: string; // 学院描述

  @Prop({ trim: true })
  dean?: string; // 院长 (初期可为字符串，未来可关联 User)

  @Prop({ trim: true })
  contactEmail?: string; // 联系邮箱

  @Prop({ trim: true })
  contactPhone?: string; // 联系电话
}

export const CollegeSchema = SchemaFactory.createForClass(College);
