import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true, // 自动添加 createdAt 和 updatedAt 字段
})
export class User {
  @Prop({ required: true, unique: true, index: true })
  username: string; // 用户名
  @Prop({ required: true })
  password: string; // 密码
  @Prop()
  nickname: string; // 昵称
  @Prop({ required: true })
  realname: string; // 真实姓名
  @Prop({ required: true, default: 'male' })
  gender: string; // 性别
  @Prop({ default: 'student' })
  userType: string; // 用户类型，学生 or 教职工
  @Prop({ unique: true, sparse: true }) // unique but can be null
  studentId?: string; // 学号（学生特有）
  @Prop({ unique: true, sparse: true }) // unique but can be null
  staffId?: string; // 工号（教职工特有）
  @Prop({ type: [String], default: [] })
  roles: string[]; // 角色
  @Prop({ type: Object })
  departmentInfo: {
    // 学院信息
    departmentId: string; // 学院ID
    departmentName: string; // 学院名称
  };
  @Prop({ type: Object })
  classInfo: {
    // 班级信息（学生）
    classId: string; // 班级ID
    className: string; // 班级名称
  };
  @Prop({ type: Object })
  staffInfo: {
    // 教职工特有信息
    officeLocation?: string; // 办公地点
    title?: string[]; // 职称
    managedClassIds?: string[]; // 管理的班级ID（辅导员）
  };
  @Prop({ type: Object })
  @Prop({ unique: true })
  email: string;
  @Prop({ required: true, unique: true })
  phone: string; // 手机号
  @Prop({ default: 'active' })
  status: string; // 用户状态，正常 or 禁用
}

export const UserSchema = SchemaFactory.createForClass(User);
