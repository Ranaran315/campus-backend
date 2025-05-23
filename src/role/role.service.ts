import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger, // 引入 BadRequestException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument } from './schemas/role.schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { VALID_PERMISSIONS } from './constants/permissions.constants';
import { UserDocument } from '../users/schemas/user.schema';
import {
  RoleScopeResponseDto,
  UserRoleResponseDto,
} from './dto/role-response.dto';
import { AuthenticatedUser } from 'src/auth/types';

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

  private readonly logger = new Logger(RoleService.name);

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

  async getCurrentUserSendableRoles(
    user: AuthenticatedUser,
  ): Promise<UserRoleResponseDto[]> {
    if (!user || !user.roles || user.roles.length === 0) {
      return [];
    }

    const sendableRoles: UserRoleResponseDto[] = [];
    let rolesToProcess: RoleDocument[];

    const roleNames = user.roles;
    this.logger.debug(
      `User roles from AuthenticatedUser are names: [${roleNames.join(', ')}]. Fetching roles by name.`,
    );

    rolesToProcess = await this.roleModel
      .find({ name: { $in: roleNames } })
      .exec();

    if (rolesToProcess.length !== roleNames.length) {
      const foundRoleNames = rolesToProcess.map((r) => r.name);
      const missingRoleNames = roleNames.filter(
        (name) => !foundRoleNames.includes(name),
      );
      this.logger.warn(
        `Could not find RoleDocuments for all role names. Requested: [${roleNames.join(', ')}]. Found: [${foundRoleNames.join(', ')}]. Missing: [${missingRoleNames.join(', ')}]`,
      );
    }

    if (!rolesToProcess || rolesToProcess.length === 0) {
      this.logger.debug(
        'No RoleDocuments to process after fetching from role names.',
      );
      return [];
    }

    this.logger.debug(`Processing ${rolesToProcess.length} RoleDocuments.`);
    for (const role of rolesToProcess) {
      // Removed permission check: role.permissions.some((p) => p.startsWith('inform:publish'))
      // Now, all roles found for the user are considered sendable.
      if (role) {
        // Basic check to ensure role object exists
        sendableRoles.push({
          code: role.name, // Use 'name' (e.g., 'student', 'admin') as the code
          name: role.displayName, // Use 'displayName' (e.g., '学生', '管理员') for display
          description: role.description,
        });
      }
    }
    this.logger.debug(
      'Final sendable roles (all user roles are sendable):',
      sendableRoles,
    );
    return sendableRoles;
  }

  async getScopesForRole(
    user: UserDocument,
    roleCode: string,
  ): Promise<RoleScopeResponseDto[]> {
    const scopes: RoleScopeResponseDto[] = [];

    // Default scope for all roles
    scopes.push({
      label: '我的好友',
      targetType: 'SPECIFIC_USERS', // Directly use the string literal as defined in Inform schema
      description: '选择我的好友作为发送对象',
    });

    // General scopes available to many roles
    scopes.push({
      label: '指定全体',
      targetType: 'ALL',
      description: '向全校范围发送',
    });
    scopes.push({
      label: '指定角色',
      targetType: 'ROLE',
      description: '选择一个或多个角色作为发送对象',
    });
    scopes.push({
      label: '指定学院',
      targetType: 'COLLEGE',
      description: '选择一个或多个学院作为发送对象',
    });
    scopes.push({
      label: '指定专业',
      targetType: 'MAJOR',
      description: '选择一个或多个专业作为发送对象',
    });
    scopes.push({
      label: '指定班级',
      targetType: 'ACADEMIC_CLASS',
      description: '选择一个或多个班级作为发送对象',
    });

    // Role-specific scopes
    // Find the role document to check its properties or permissions if needed
    // const roleDoc = await this.roleModel.findOne({ name: roleCode }).exec();
    // if (!roleDoc) {
    //   throw new NotFoundException(`Role with code '${roleCode}' not found.`);
    // }

    // Example: Counselor-specific scopes
    if (roleCode === 'counselor' || roleCode === 'instructor') {
      // Assuming 'counselor' is a role 'name'
      if (
        user.staffInfo?.managedClasses &&
        user.staffInfo.managedClasses.length > 0
      ) {
        scopes.push({
          label: '我管理的班级',
          targetType: 'SENDER_MANAGED_CLASSES',
          description: '向您管理的所有班级发送',
        });
      }
    }

    // Example: Department Admin specific scopes
    if (roleCode === 'department_admin' || roleCode === 'college_admin') {
      // Assuming these are role 'name's
      if (user.college) {
        // User's primary college
        // Ensure college is populated to get its name
        // This might require fetching the user with populated college if it's not already
        const collegeName = (user.college as any)?.name || '本学院'; // Basic check, improve if college is ObjectId
        scopes.push({
          label: `我所在学院全体师生 (${collegeName})`,
          targetType: 'SENDER_COLLEGE_STUDENTS',
          description: `向您所在的学院 (${collegeName}) 的全体师生发送`,
        });
      }
    }

    // Add other role-specific scopes based on roleCode and user properties
    // e.g., for a 'student_union_president'
    // if (roleCode === 'student_union_president') {
    //   scopes.push({
    //     label: '全体学生',
    //     targetType: 'USER_TYPE_STUDENTS', // This targetType would need to be added to Inform schema
    //     description: '向全校所有学生发送',
    //   });
    // }

    const uniqueScopes = scopes.filter(
      (scope, index, self) =>
        index ===
        self.findIndex(
          (s) => s.label === scope.label && s.targetType === scope.targetType,
        ),
    );

    return uniqueScopes;
  }
}
