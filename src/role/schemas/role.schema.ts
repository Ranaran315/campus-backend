import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RoleDocument = Role & Document;

@Schema({ timestamps: true })
export class Role {
  @Prop({ required: true, unique: true, trim: true })
  name: string; // 角色内部名称，例如 "counselor", "department_admin" (英文，用于代码判断)

  @Prop({ required: true, trim: true })
  displayName: string; // 角色显示名称，例如 "辅导员", "院系管理员" (中文，用于界面显示)

  @Prop({ type: String, trim: true })
  description?: string; // 角色描述 (可选)

  @Prop({ type: [String], required: true, default: [] })
  permissions: string[]; // 该角色拥有的权限点字符串列表，例如 ['notification:publish_to_class', 'user:view_managed_class_student_profile']

  @Prop({ type: Boolean, default: false })
  isSystemRole?: boolean; // 标记是否为系统内置角色，防止误删或提供特殊处理
}

export const RoleSchema = SchemaFactory.createForClass(Role);
