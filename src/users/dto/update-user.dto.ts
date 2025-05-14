/* eslint-disable @typescript-eslint/no-unsafe-call */
import { PartialType } from '@nestjs/mapped-types'; // 使用 mapped-types 方便创建部分更新的 DTO
import { CreateUserDto, StaffInfoDto } from './create-user.dto';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStaffInfoDto extends PartialType(StaffInfoDto) {}

// PartialType 会将 CreateUserDto 的所有属性变为可选
export class UpdateUserDto extends PartialType(CreateUserDto) {
  // 如果密码在更新时也是可选的，并需要保持最小长度验证
  @IsString()
  @MinLength(6, { message: '密码长度不能少于6位' })
  @IsOptional()
  password?: string;

  // 明确 staffInfo 在更新时也是可选的，并且其内部字段也应该是可选的
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateStaffInfoDto) // 使用 UpdateStaffInfoDto
  @IsOptional()
  staffInfo?: UpdateStaffInfoDto;

  // 确保其他从 CreateUserDto 继承的字段如 collegeId, majorId, academicClassId 也是可选的
  @IsMongoId({ message: '无效的学院ID格式' })
  @IsOptional()
  collegeId?: string;

  @IsMongoId({ message: '无效的专业ID格式' })
  @IsOptional()
  majorId?: string;

  @IsMongoId({ message: '无效的班级ID格式' })
  @IsOptional()
  academicClassId?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 15)
  nickname?: string;

  // realname 通常不允许用户自己修改，如果允许，则取消注释
  @IsOptional()
  @IsString()
  @Length(2, 15)
  realname?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: string;

  @IsOptional()
  @IsDateString()
  birthday?: string; // 注意：UserSchema 中 birthday 字段类型是 Date，这里是 string，服务层需要转换

  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址。' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号码。' })
  phone?: string;

  @IsOptional()
  @IsString()
  description?: string; // 允许用户更新个人简介

  // 头像 avatar 通常通过单独的上传接口处理，这里不包含
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6, { message: '密码长度不能少于6位' })
  newPassword: string;
}
