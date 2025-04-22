// (简单示例，实际项目会用 class-validator 添加 @IsOptional() 等)
import { PartialType } from '@nestjs/mapped-types'; // 用于继承和标记为可选

export class UpdateUserDto extends PartialType(CreateUserDto) {}
