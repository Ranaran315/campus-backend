import {
  Controller,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  BadRequestException,
  Get,
  UseGuards, // Ensure UseGuards is imported
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RoleService } from '../role/role.service';
import { Types } from 'mongoose';
import { AssignRoleDto } from './dto/assign-role.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Import JwtAuthGuard
import { PermissionsGuard } from '../auth/guards/permissions.guard'; // Import PermissionsGuard
import { Permissions } from '../auth/decorators/permissions.decorator'; // Import Permissions decorator

@Controller('admin/users')
@UseGuards(JwtAuthGuard) // Apply JwtAuthGuard at controller level
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly roleService: RoleService,
  ) {}

  // 分配角色给用户
  @Post(':userId/assign-role')
  @UseGuards(PermissionsGuard)
  @Permissions('user:assign_roles_to_any') // Permission to assign roles
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @HttpCode(HttpStatus.OK)
  async assignRoleToUser(
    @Param('userId') userId: string,
    @Body() assignRoleDto: AssignRoleDto,
  ): Promise<any> {
    // Consider returning the updated user document
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(assignRoleDto.roleId)
    ) {
      throw new BadRequestException('Invalid User ID or Role ID format.');
    }

    // Check if user exists
    const user = await this.usersService.findOneById(userId); // Assuming findOneById exists
    if (!user) {
      throw new NotFoundException(`User with ID '${userId}' not found.`);
    }

    // Check if role exists
    const role = await this.roleService.findOne(assignRoleDto.roleId);
    if (!role) {
      throw new NotFoundException(
        `Role with ID '${assignRoleDto.roleId}' not found.`,
      );
    }

    // Prevent assigning a system role if it's restricted by business logic (optional)
    // if (role.isSystemRole && !someConditionForAllowingSystemRoleAssignment) {
    //   throw new BadRequestException(`Cannot directly assign system role '${role.displayName}'.`);
    // }

    return this.usersService.addRoleToUser(userId, assignRoleDto.roleId);
  }

  // 取消分配角色给用户
  @Delete(':userId/unassign-role/:roleId')
  @UseGuards(PermissionsGuard)
  @Permissions('user:assign_roles_to_any') // Same permission, as it's managing role assignments
  @HttpCode(HttpStatus.OK) // Or HttpStatus.NO_CONTENT if no body is returned
  // @Roles('SuperAdmin', 'Admin')
  async removeRoleFromUser(
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
  ): Promise<any> {
    // Consider returning the updated user document or a success message
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(roleId)) {
      throw new BadRequestException('Invalid User ID or Role ID format.');
    }

    // Check if user exists
    const user = await this.usersService.findOneById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID '${userId}' not found.`);
    }

    // Check if role exists (optional, as we are removing it)
    // const role = await this.roleService.findOne(roleId);
    // if (!role) {
    //   throw new NotFoundException(`Role with ID '${roleId}' not found.`);
    // }

    // Prevent removing a critical system role if needed (optional)
    // if (role.isSystemRole && role.name === 'SuperAdmin' && user.roles.filter(r => r.toString() === roleId).length <= 1) {
    //   throw new BadRequestException(`Cannot remove the last SuperAdmin role from this user.`);
    // }

    return this.usersService.removeRoleFromUser(userId, roleId);
  }

  // 管理员修改用户信息
  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('user:edit_account_any') // Permission to edit any user's account
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @HttpCode(HttpStatus.OK)
  async adminUpdateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  // 管理员获取所有用户（带关联信息）
  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('user:list_all') // Permission to list all users
  async getAllUsersWithRelations() {
    return this.usersService.findAllWithRelations();
  }
}
