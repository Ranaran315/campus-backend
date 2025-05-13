import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { College } from '../../college/schemas/college.schema'; // 调整路径以匹配项目结构

export type MajorDocument = Major & Document;

@Schema({ timestamps: true })
export class Major {
  @Prop({ required: true, trim: true, index: true })
  name: string; // 专业名称，例如 "软件工程"

  @Prop({ unique: true, sparse: true, trim: true })
  majorId?: string; // 专业代码 (可选), 例如 "SWE"

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'College',
    required: true,
    index: true,
  })
  college: College; // 所属学院，类型为 College 的 ObjectId

  @Prop({ trim: true })
  degreeOffered?: string; // 授予学位，例如 "工学学士"

  @Prop({ type: Number })
  durationYears?: number; // 学制年限，例如 4

  @Prop({ trim: true })
  description?: string; // 专业描述
}

export const MajorSchema = SchemaFactory.createForClass(Major);

// 为 (college, name) 创建复合唯一索引，确保同一学院下专业名唯一
MajorSchema.index({ college: 1, name: 1 }, { unique: true });
