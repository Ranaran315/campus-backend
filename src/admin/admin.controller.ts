import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RoleService } from '../role/role.service';
import { Types } from 'mongoose';
import { AssignRoleDto } from './dto/assign-role.dto';

@Controller('admin') // Base path for admin user operations
// @UseGuards(AdminGuard) // Placeholder for a future AdminGuard
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly roleService: RoleService,
  ) {}

  // Endpoint to assign a role to a user
  @Post(':userId/roles')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @HttpCode(HttpStatus.OK)
  // @Roles('SuperAdmin', 'Admin') // Placeholder for specific admin role checks
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

  // Endpoint to remove a role from a user
  @Delete(':userId/roles/:roleId')
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

  // You can add other admin-specific user management endpoints here, e.g.,
  // @Get()
  // async getAllUsersForAdmin() { /* ... */ }

  // @Patch(':userId/status')
  // async updateUserStatus(@Param('userId') userId: string, @Body() statusUpdateDto: any) { /* ... */ }
}
