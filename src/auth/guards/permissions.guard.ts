import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common'; // Import Logger
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedUser } from '../strategies/jwt.strategy'; // Import AuthenticatedUser

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name); // Add logger instance

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
      .getRequest<{ user?: AuthenticatedUser }>(); // Use AuthenticatedUser type

    this.logger.debug(`User object in PermissionsGuard:`, user); // Log the user object
    this.logger.debug(
      `Required permissions: ${requiredPermissions.join(', ')}`,
    );

    // Check if user exists and has a permissions array
    if (!user || !Array.isArray(user.permissions)) {
      this.logger.error(
        'PermissionsGuard: User object or user.permissions array is missing or not an array.',
        JSON.stringify(user), // Log user object as string for better inspection
      );
      return false;
    }

    const userPermissions = new Set<string>(user.permissions);
    this.logger.debug(
      `User permissions: ${Array.from(userPermissions).join(', ')}`,
    );

    const hasAllRequiredPermissions = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    if (!hasAllRequiredPermissions) {
      this.logger.warn(
        `PermissionsGuard: User does not have all required permissions. Missing: ${requiredPermissions.filter((p) => !userPermissions.has(p)).join(', ')}`,
      );
    }

    return hasAllRequiredPermissions;
  }
}
