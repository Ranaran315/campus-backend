/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

class DepartmentInfoDto {
  @IsString() @IsNotEmpty() departmentId: string;
  @IsString() @IsNotEmpty() departmentName: string;
}

class ClassInfoDto {
  @IsString() @IsNotEmpty() classId: string;
  @IsString() @IsNotEmpty() className: string;
}

class StaffInfoDto {
  @IsArray() @IsString({ each: true }) @IsOptional() title?: string[];
  @IsString() @IsOptional() officeLocation?: string; // 注意修正拼写
  @IsArray() @IsString({ each: true }) @IsOptional() managedClassIds?: string[];
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

  @IsEnum(['male', 'female', 'other'], { message: '性别无效' }) // 假设允许的值
  @IsNotEmpty()
  gender: string;

  @IsObject()
  @ValidateNested() // 需要验证嵌套对象
  @Type(() => DepartmentInfoDto) // 需要 class-transformer 辅助转换和验证
  @IsDefined() // 确保 departmentInfo 对象本身被提供
  departmentInfo: DepartmentInfoDto;

  // classInfo 只在 userType 为 student 时需要，可以在 Service 层做逻辑校验，或者 DTO 层面做更复杂的条件验证
  @IsObject()
  @ValidateNested()
  @Type(() => ClassInfoDto)
  @IsOptional()
  classInfo?: ClassInfoDto;

  // staffInfo 只在 userType 为 staff 时需要
  @IsObject()
  @ValidateNested()
  @Type(() => StaffInfoDto)
  @IsOptional()
  staffInfo?: StaffInfoDto;

  @IsString()
  @IsNotEmpty()
  @IsOptional() // 手机号在注册时是否必填？根据需求调整
  phone: string;

  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsNotEmpty()
  email?: string;
}
