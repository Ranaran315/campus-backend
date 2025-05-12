import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { UserDocument } from '../../users/user.schema';
import { RoleDocument } from '../../role/role.schema';
import { Types } from 'mongoose'; // Import Types for ObjectId check

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions are required, access granted
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: UserDocument }>();

    if (!user || !Array.isArray(user.roles) || user.roles.length === 0) {
      // If no roles, user cannot have any permissions from them.
      // Access will be denied if requiredPermissions is not empty.
      return false;
    }

    // Runtime check to ensure roles are populated RoleDocument objects, not just ObjectIds
    const firstRole = user.roles[0];
    if (
      typeof firstRole === 'string' || // Check if it's a string ObjectId
      firstRole instanceof Types.ObjectId || // Check if it's an ObjectId instance
      !firstRole || // Check if it's null or undefined
      typeof firstRole !== 'object' || // Check if it's not an object
      !('permissions' in firstRole) || // Check for a distinctive property of RoleDocument
      !Array.isArray((firstRole as RoleDocument).permissions)
    ) {
      console.error(
        'PermissionsGuard: user.roles do not appear to be populated RoleDocument[]. Actual first role:',
        firstRole,
      );
      return false; // Deny access if roles are not in the expected shape
    }

    // Now we are more confident in the type assertion
    const userRoles = user.roles as unknown as RoleDocument[];

    const userPermissions = new Set<string>();
    userRoles.forEach((role) => {
      // It's good practice to ensure role and role.permissions exist and are arrays
      if (role && Array.isArray(role.permissions)) {
        role.permissions.forEach((permission) =>
          userPermissions.add(permission),
        );
      }
    });

    return requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );
  }
}
