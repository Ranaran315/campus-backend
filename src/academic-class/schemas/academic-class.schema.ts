import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Major } from '../../major/schemas/major.schema';
import { College } from '../../college/schemas/college.schema';
import { User } from '../../users/schemas/user.schema'; // Corrected path for User schema

export type AcademicClassDocument = AcademicClass & Document;

@Schema({ timestamps: true })
export class AcademicClass {
  @Prop({ required: true, trim: true, index: true })
  name: string; // 班级名称，例如 "软件工程2021级1班"

  @Prop({ unique: true, sparse: true, trim: true })
  classId?: string; // 班级代码 (可选), 例如 "SWE2101"

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Major',
    required: true,
    index: true,
  })
  major: Major; // 所属专业

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'College',
    required: true,
    index: true,
  })
  college: College; // 所属学院 (从专业信息中获取并存储)

  @Prop({ required: true, type: Number, index: true })
  entryYear: number; // 入学年份，例如 2021

  @Prop({ type: Number })
  graduationYear?: number; // 预计毕业年份

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', sparse: true })
  counselor?: User; // 辅导员

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', sparse: true })
  classMonitor?: User; // 班长

  @Prop({ trim: true })
  remarks?: string; // 备注
}

export const AcademicClassSchema = SchemaFactory.createForClass(AcademicClass);

// (major, entryYear, name) 或 (college, entryYear, name) 创建复合唯一索引
// More specific index: A class name should be unique within a major and entry year.
AcademicClassSchema.index(
  { major: 1, entryYear: 1, name: 1 },
  { unique: true },
);
// Optional: if classId is meant to be globally unique or unique within a college
// AcademicClassSchema.index({ college: 1, classId: 1 }, { unique: true, sparse: true });
