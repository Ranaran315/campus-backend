// src/admin/dto/import-users.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// 定义嵌套对象 DTO (用于验证结构)
class DepartmentInfoDto {
  @IsString() @IsNotEmpty() departmentId: string;
  @IsString() @IsNotEmpty() departmentName: string;
}
class ClassInfoDto {
  @IsString() @IsNotEmpty() classId: string;
  @IsString() @IsNotEmpty() className: string;
}
class StaffInfoDto {
  @IsArray() @IsString({ each: true }) @IsOptional() titles?: string[];
  @IsString() @IsOptional() officeLocation?: string;
  @IsArray() @IsString({ each: true }) @IsOptional() managedClassIds?: string[];
}

// 定义单个用户导入时的数据结构
export class UserImportItemDto {
  @IsString()
  @IsNotEmpty()
  identifier: string; // 学号 或 工号

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsEnum(['student', 'staff'])
  userType: string;

  @IsArray()
  @IsString({ each: true })
  roles: string[]; // 需要预先定义好的角色

  @IsOptional()
  @ValidateNested()
  @Type(() => DepartmentInfoDto)
  departmentInfo?: DepartmentInfoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClassInfoDto)
  classInfo?: ClassInfoDto; // 仅学生需要

  @IsOptional()
  @ValidateNested()
  @Type(() => StaffInfoDto)
  staffInfo?: StaffInfoDto; // 仅教职工需要
}

// 定义整个请求体的数据结构，包含一个用户数组
export class ImportUsersDto {
  @IsArray()
  @ValidateNested({ each: true }) // 验证数组中的每个对象
  @Type(() => UserImportItemDto) // 指定数组元素的类型
  users: UserImportItemDto[];
}
