import { IsNotEmpty, IsString, IsMongoId } from 'class-validator';

export class AssignRoleDto {
  @IsNotEmpty()
  @IsString()
  @IsMongoId({ message: 'roleId must be a valid MongoDB ObjectId' })
  roleId: string;
}
