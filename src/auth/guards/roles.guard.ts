import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserDocument } from '../../users/schemas/user.schema';
import { RoleDocument } from '../../role/schemas/role.schema';
import { Types } from 'mongoose'; // Import Types for ObjectId check

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles are required, access granted
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: UserDocument }>();

    if (!user || !Array.isArray(user.roles) || user.roles.length === 0) {
      return false;
    }

    // Runtime check to ensure roles are populated RoleDocument objects
    const firstRole = user.roles[0]; // TypeScript infers firstRole based on UserDocument.roles

    // Check 1: If it's an ObjectId instance, it's definitely not populated.
    if (firstRole instanceof Types.ObjectId) {
      console.error(
        'RolesGuard: user.roles appear to be ObjectIds (not populated). First role ID:',
        (firstRole as Types.ObjectId).toHexString(), // Safe to cast here for toHexString
      );
      return false;
    }

    // Check 2: If it's not an ObjectId, it should be an object with a 'name' property of type string.
    if (
      !firstRole || // Handles null or undefined after the ObjectId check
      typeof firstRole !== 'object' || // Must be an object
      !Object.prototype.hasOwnProperty.call(firstRole, 'name') || // Check if 'name' property exists
      typeof (firstRole as RoleDocument).name !== 'string' // Check if 'name' is a string
    ) {
      console.error(
        'RolesGuard: user.roles[0] does not have the expected shape of a populated RoleDocument. Content:',
        firstRole,
      );
      return false;
    }

    // If all checks pass, we can confidently cast the entire array.
    const userRoles = user.roles as unknown as RoleDocument[];

    return requiredRoles.some((roleName) =>
      userRoles.some((userRole) => userRole.name === roleName),
    );
  }
}
