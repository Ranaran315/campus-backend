// src/auth/auth.service.ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

interface PopulatedRole {
  _id: any; // or string, or mongoose.Types.ObjectId
  name: string;
  permissions: string[];
  // other properties if any
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  private readonly logger = new Logger('AuthService'); // 添加日志记录器

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByUsernameForAuth(username); // 这个方法会返回密码
    if (user && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user.toObject();
      return result;
    }
    return null;
  }

  async login(user: any) {

    const roleNames: string[] = [];
    const permissionSet = new Set<string>();

    if (user.roles && Array.isArray(user.roles)) {
      user.roles.forEach((role: PopulatedRole) => {
        if (role && role.name) {
          roleNames.push(role.name);
        }
        if (role && Array.isArray(role.permissions)) {
          role.permissions.forEach(permission => permissionSet.add(permission));
        }
      });
    }
    const uniquePermissions = Array.from(permissionSet);

    const payload = {
      username: user.username,
      sub: user._id,
      roles: roleNames,
      permissions: uniquePermissions
    };

    const returnUser = {
      id: user._id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar ?? '',
      roles: roleNames,
      permissions: uniquePermissions,
    };

    this.logger.log(`User ${user.username} logged in successfully.`); // 记录登录成功的日志
    this.logger.debug(`JWT Payload: ${JSON.stringify(payload)}`);
    this.logger.debug(`Return UserInfo: ${JSON.stringify(returnUser)}`);

    this.logger.debug(`Return UserInfo: ${returnUser.avatar}`);

    return {
      access_token: this.jwtService.sign(payload),
      // 可以选择性返回一些用户信息
      user: returnUser,
    };
  }
}
