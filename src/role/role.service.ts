import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException, // 引入 BadRequestException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument } from './schemas/role.schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { VALID_PERMISSIONS } from './constants/permissions.constants';

function isValidPermission(permission: string): boolean {
  return VALID_PERMISSIONS.has(permission);
}

function validatePermissions(permissions: string[]): void {
  if (permissions) {
    for (const p of permissions) {
      if (!isValidPermission(p)) {
        throw new BadRequestException(`Invalid permission string: ${p}`);
      }
    }
  }
}

@Injectable()
export class RoleService {
  constructor(@InjectModel(Role.name) private roleModel: Model<RoleDocument>) {}

  async create(createRoleDto: CreateRoleDto): Promise<RoleDocument> {
    // 返回 RoleDocument
    if (createRoleDto.permissions) {
      validatePermissions(createRoleDto.permissions);
    }
    const existingRole = await this.roleModel
      .findOne({ name: createRoleDto.name })
      .exec();
    if (existingRole) {
      throw new ConflictException(
        `Role with name '${createRoleDto.name}' already exists.`,
      );
    }
    const createdRole = new this.roleModel(createRoleDto);
    return createdRole.save();
  }

  async findAll(): Promise<RoleDocument[]> {
    // 建议也返回 RoleDocument[]
    return this.roleModel.find().exec();
  }

  async findOne(id: string): Promise<RoleDocument> {
    // 返回 RoleDocument
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Invalid role ID: ${id}`);
    }
    const role = await this.roleModel.findById(id).exec();
    if (!role) {
      throw new NotFoundException(`Role with ID '${id}' not found.`);
    }
    return role;
  }

  async findByName(name: string): Promise<RoleDocument> {
    // 返回 RoleDocument
    const role = await this.roleModel.findOne({ name }).exec();
    if (!role) {
      throw new NotFoundException(`Role with name '${name}' not found.`);
    }
    return role;
  }

  async update(
    id: string,
    updateRoleDto: UpdateRoleDto,
  ): Promise<RoleDocument> {
    // 返回 RoleDocument
    if (updateRoleDto.permissions) {
      validatePermissions(updateRoleDto.permissions);
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Invalid role ID: ${id}`);
    }
    const existingRole = await this.roleModel.findById(id).exec(); // existingRole 是 RoleDocument
    if (!existingRole) {
      throw new NotFoundException(`Role with ID '${id}' not found.`);
    }

    // 如果尝试修改 name，需要检查新 name 是否已存在 (且不是当前角色自己)
    if (updateRoleDto.name && updateRoleDto.name !== existingRole.name) {
      const roleWithNewName = await this.roleModel
        .findOne({ name: updateRoleDto.name })
        .exec();
      if (roleWithNewName) {
        throw new ConflictException(
          `Role name '${updateRoleDto.name}' is already in use.`,
        );
      }
    }

    // 对于系统角色，可能有一些限制，例如不允许修改 name 或 isSystemRole 标志
    // if (existingRole.isSystemRole) {
    //   // 示例：不允许修改系统角色的名称
    //   if (updateRoleDto.name && updateRoleDto.name !== existingRole.name) {
    //     throw new ConflictException('Cannot change the name of a system role.');
    //   }
    //   // 示例：不允许将系统角色变为非系统角色
    //   if (updateRoleDto.isSystemRole === false) {
    //      throw new ConflictException('Cannot change a system role to a non-system role.');
    //   }
    // }

    Object.assign(existingRole, updateRoleDto);
    return existingRole.save(); // 现在 existingRole 是 RoleDocument，可以调用 save
  }

  async remove(id: string): Promise<{ deleted: boolean; message?: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Invalid role ID: ${id}`);
    }
    const role = await this.findOne(id); // findOne 现在返回 RoleDocument
    if (role.isSystemRole) {
      return {
        deleted: false,
        message: `System role '${role.displayName}' cannot be deleted.`,
      };
    }
    const result = await this.roleModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(
        `Role with ID '${id}' not found or already deleted.`,
      );
    }
    return { deleted: true };
  }

  async addPermissionToRole(
    roleId: string,
    permission: string,
  ): Promise<RoleDocument> {
    // 返回 RoleDocument
    if (!isValidPermission(permission)) {
      throw new BadRequestException(`Invalid permission string: ${permission}`);
    }
    const role = await this.findOne(roleId); // role 现在是 RoleDocument
    if (!role.permissions.includes(permission)) {
      role.permissions.push(permission);
      return role.save(); // 正确
    }
    return role;
  }

  async removePermissionFromRole(
    roleId: string,
    permission: string,
  ): Promise<RoleDocument> {
    // 返回 RoleDocument
    // 校验 permission 是否存在于 role 的权限中是可选的，取决于业务逻辑
    // 如果 permission 字符串本身也需要校验其有效性，可以添加：
    // if (!isValidPermission(permission)) {
    //   throw new BadRequestException(`Invalid permission string for removal: ${permission}`);
    // }
    const role = await this.findOne(roleId); // role 现在是 RoleDocument
    const index = role.permissions.indexOf(permission);
    if (index > -1) {
      role.permissions.splice(index, 1);
      return role.save(); // 正确
    }
    return role;
  }
}
