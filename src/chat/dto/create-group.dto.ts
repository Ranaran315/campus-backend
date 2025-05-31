import { IsString, IsOptional, Length } from 'class-validator';

// TEMPORARILY SIMPLIFIED FOR DEBUGGING
export class CreateGroupDto {
  @IsString()
  @Length(1, 20, { message: '群名称长度必须在1-20个字符之间' })
  name: string;
  
  @IsOptional()
  @IsString()
  @Length(0, 200, { message: '群描述不能超过200个字符' })
  description?: string;

  // 'members' field is completely removed for this test
}