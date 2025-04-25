/* eslint-disable @typescript-eslint/no-unsafe-call */
import { PartialType } from '@nestjs/mapped-types'; // 使用 mapped-types 方便创建部分更新的 DTO
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, MinLength } from 'class-validator';

// PartialType 会将 CreateUserDto 的所有属性变为可选
export class UpdateUserDto extends PartialType(CreateUserDto) {
  // 如果密码在更新时也是可选的，并需要保持最小长度验证
  @IsString()
  @MinLength(6, { message: '密码长度不能少于6位' })
  @IsOptional() // 明确密码是可选的
  password?: string;
}
