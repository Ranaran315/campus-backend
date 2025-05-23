export interface UserRoleResponseDto {
  code: string;
  name: string;
  description?: string;
}

export interface RoleScopeResponseDto {
  label: string;
  targetType: string;
  description?: string;
}
