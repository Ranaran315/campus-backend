import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateGroupAvatarDto {
  @IsString()
  @IsNotEmpty({ message: '头像URL不能为空' })
  avatar: string;
} 