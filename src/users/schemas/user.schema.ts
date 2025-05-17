import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Role } from '../../role/schemas/role.schema'; // 引入 Role

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
  @Prop()
  avatar: string; // 头像
  @Prop()
  birthday: Date; // 生日
  @Prop()
  description: string; // 个人简介
  @Prop({ default: 'student' })
  userType: string; // 用户类型，学生 or 教职工
  @Prop({ unique: true, sparse: true }) // unique but can be null
  studentId?: string; // 学号（学生特有）
  @Prop({ unique: true, sparse: true }) // unique but can be null
  staffId?: string; // 工号（教职工特有）
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Role' }], default: [] })
  roles: Types.ObjectId[]; // 角色
  @Prop({ type: Types.ObjectId, ref: 'College', required: false, index: true })
  college?: Types.ObjectId; // 所属学院 (学生/教职工均可有)

  @Prop({ type: Types.ObjectId, ref: 'Major', required: false, index: true })
  major?: Types.ObjectId; // 所属专业 (主要为学生)

  @Prop({
    type: Types.ObjectId,
    ref: 'AcademicClass',
    required: false,
    index: true,
  })
  academicClass?: Types.ObjectId; // 所属行政班级 (主要为学生)
  @Prop({
    type: {
      officeLocation: { type: String, required: false },
      title: { type: [String], required: false }, // 职称可以是多个
      // 教职工所属的部门/学院
      department: {
        type: Types.ObjectId,
        ref: 'College',
        required: false,
      },
      // 教职工管理的班级 (例如辅导员)
      managedClasses: [
        { type: Types.ObjectId, ref: 'AcademicClass', required: false },
      ],
    },
    required: false,
    _id: false, // staffInfo 不是一个独立的文档，不需要 _id
  })
  staffInfo?: {
    officeLocation?: string;
    title?: string[];
    department?: Types.ObjectId;
    managedClasses?: Types.ObjectId[];
  };

  @Prop({ unique: true, required: true, trim: true })
  email: string;
  @Prop({ required: true, unique: true })
  phone: string; // 手机号
  @Prop({ default: 'active' })
  status: string; // 用户状态，正常 or 禁用
  @Prop()
  onlineStatus: string; // 在线状态，在线 or 离线
  @Prop()
  lastOnlineTime: Date; // 最后在线时间
}

export const UserSchema = SchemaFactory.createForClass(User);
