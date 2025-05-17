// src/auth/strategies/jwt.strategy.ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User, UserDocument } from 'src/users/schemas/user.schema'; // 确保 User 也被导入
import { UsersService } from 'src/users/users.service';
import { Types } from 'mongoose'; // 导入 Types

// 定义 AuthenticatedUser 接口
export interface AuthenticatedUser extends Omit<User, 'roles'> {
  _id: Types.ObjectId;
  id: string;
  roles: string[]; // 来自 JWT payload
  permissions: string[]; // 来自 JWT payload
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // 从 Authorization Bearer Header 提取 Token
      ignoreExpiration: false, // 不忽略过期
      secretOrKey: configService.get<string>('JWT_SECRET')!, // 从配置中获取密钥
    });
  }

  private readonly logger = new Logger(JwtStrategy.name);

  async validate(payload: any): Promise<AuthenticatedUser> {
    // 返回类型修改为 AuthenticatedUser
    this.logger.debug('JWT payload:', payload);

    const userFromDb = await this.usersService.findOneById(payload.sub);
    if (!userFromDb) {
      throw new UnauthorizedException('User not found or token invalid.');
    }

    // 将 UserDocument 转换为普通对象
    // .toObject() 返回的类型是 User 类的属性加上 _id 等 Mongoose 添加的属性。
    // 我们断言为 Omit<User, 'roles'> & { _id: Types.ObjectId } 以便扩展。
    const plainUserObject = userFromDb.toObject() as Omit<User, 'roles'> & {
      _id: Types.ObjectId;
    };

    const authenticatedUser: AuthenticatedUser = {
      ...plainUserObject, // 展开从数据库获取并转换后的用户对象属性
      id: userFromDb._id.toString(), // 确保 id 是字符串形式的 _id
      roles: payload.roles || [], // 从 JWT payload 获取 roles
      permissions: payload.permissions || [], // 从 JWT payload 获取 permissions
    };

    this.logger.debug(
      'Authenticated user object constructed:',
      authenticatedUser,
    );
    return authenticatedUser;
  }
}
