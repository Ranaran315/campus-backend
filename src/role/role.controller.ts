import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
// import { RolesGuard } from '../auth/guards/roles.guard'; // 假设你将来会有 RolesGuard
// import { Roles } from '../auth/decorators/roles.decorator'; // 假设你将来会有 Roles 装饰器

@Controller('roles') // 路由前缀改为 'roles' 更符合 RESTful 风格
// @UseGuards(RolesGuard) // 将来可以启用守卫，限制访问
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  // @Roles('SuperAdmin', 'Admin') // 示例：只有特定角色的用户才能创建
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.roleService.create(createRoleDto);
  }

  @Get()
  // @Roles('SuperAdmin', 'Admin', 'DepartmentAdmin') // 示例：更多角色可以查看列表
  findAll() {
    return this.roleService.findAll();
  }

  @Get(':id')
  // @Roles('SuperAdmin', 'Admin', 'DepartmentAdmin')
  findOne(@Param('id') id: string) {
    return this.roleService.findOne(id);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  // @Roles('SuperAdmin', 'Admin')
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.roleService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // 成功删除通常返回 204 No Content
  // @Roles('SuperAdmin') // 示例：只有超级管理员才能删除
  async remove(@Param('id') id: string) {
    const result = await this.roleService.remove(id);
    if (!result.deleted && result.message) {
      // 如果 service 返回了特定消息（例如系统角色不能删除），可以根据需要处理
      // 这里简单地不返回内容，或者可以抛出相应的 HttpException
    }
    return; // 对于 204，通常不返回 body
  }

  // --- 权限点分配给角色的特定接口 (可选) ---
  // 如果你希望有更细粒度的接口来管理单个权限，而不是通过整个 UpdateRoleDto

  @Patch(':id/permissions/add')
  // @Roles('SuperAdmin', 'Admin')
  addPermission(
    @Param('id') roleId: string,
    @Body('permission') permission: string, // 假设请求体是 { "permission": "some:permission" }
  ) {
    if (!permission) {
      throw new Error('Permission string is required'); // 或者使用 BadRequestException
    }
    return this.roleService.addPermissionToRole(roleId, permission);
  }

  @Patch(':id/permissions/remove')
  // @Roles('SuperAdmin', 'Admin')
  removePermission(
    @Param('id') roleId: string,
    @Body('permission') permission: string,
  ) {
    if (!permission) {
      throw new Error('Permission string is required');
    }
    return this.roleService.removePermissionFromRole(roleId, permission);
  }
}
