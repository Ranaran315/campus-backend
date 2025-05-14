/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class StaffInfoDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  title?: string[];

  @IsString()
  @IsOptional()
  officeLocation?: string;

  @IsMongoId() // 教职工所属部门/学院 ID
  @IsOptional()
  departmentId?: string;

  @IsArray()
  @IsMongoId({ each: true }) // 教职工管理的班级 ID 列表
  @IsOptional()
  managedClassIds?: string[];
}

// 创建用户数据传输对象
export class CreateUserDto {
  @IsEnum(['student', 'staff'], { message: '用户类型必须是 student 或 staff' })
  @IsNotEmpty()
  userType: 'student' | 'staff';

  @IsString({ message: '学号/工号必须是字符串' })
  @IsNotEmpty({ message: '学号/工号不能为空' })
  identifier: string; // 用户输入的学号或工号

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: '密码长度不能少于6位' })
  password: string; // 用户设置的密码

  @IsString()
  @IsNotEmpty()
  realname: string;

  @IsString()
  @IsOptional()
  nickname?: string;

  @IsEnum(['male', 'female', 'other'], { message: '性别无效' })
  @IsNotEmpty()
  gender: string;

  // 新增关联字段
  @IsMongoId({ message: '无效的学院ID格式' })
  @IsNotEmpty({ message: '学院ID不能为空' }) // 假设学院是必填项
  collegeId: string;

  @IsMongoId({ message: '无效的专业ID格式' })
  @IsOptional()
  majorId?: string; // 专业可选

  @IsMongoId({ message: '无效的班级ID格式' })
  @IsOptional()
  academicClassId?: string; // 班级可选，主要针对学生

  // staffInfo 只在 userType 为 staff 时需要
  @IsObject()
  @ValidateNested()
  @Type(() => StaffInfoDto)
  @IsOptional()
  staffInfo?: StaffInfoDto;

  @IsString()
  @IsNotEmpty()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号码。' })
  phone: string; // 手机号在注册时必填

  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsNotEmpty()
  email: string; // 邮箱在注册时必填
}
