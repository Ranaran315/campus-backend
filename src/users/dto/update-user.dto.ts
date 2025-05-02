/* eslint-disable @typescript-eslint/no-unsafe-call */
import { PartialType } from '@nestjs/mapped-types'; // 使用 mapped-types 方便创建部分更新的 DTO
import { CreateUserDto } from './create-user.dto';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';

// PartialType 会将 CreateUserDto 的所有属性变为可选
export class UpdateUserDto extends PartialType(CreateUserDto) {
  // 如果密码在更新时也是可选的，并需要保持最小长度验证
  @IsString()
  @MinLength(6, { message: '密码长度不能少于6位' })
  @IsOptional() // 明确密码是可选的
  password?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  nickname?: string;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  realname?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other']) // 根据你的需要调整
  gender?: string;

  @IsOptional()
  @IsDateString() // 验证是否是 ISO8601 日期字符串 (e.g., "2023-10-27")
  birthday?: string;

  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址。' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号码。' }) // 简单校验
  phone?: string;

  // 头像 avatar 通常通过单独的上传接口处理，这里不包含
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6, { message: '密码长度不能少于6位' })
  newPassword: string;
}