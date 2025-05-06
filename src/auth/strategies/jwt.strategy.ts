// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // 从 Authorization Bearer Header 提取 Token
      ignoreExpiration: false, // 不忽略过期
      secretOrKey: configService.get<string>('JWT_SECRET')!, // 从配置中获取密钥
    });
  }

  async validate(payload: any) {
    // payload 是解码后的 JWT 内容 { username, sub, roles, iat, exp }
    // 这里决定 request.user 附加什么信息
    // 可以只返回必要信息，减少数据库查询（如果不需要实时数据）
    return {
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles,
    };
    // 如果需要最新用户数据，可以注入 UsersService 在这里根据 payload.sub 查询
    // const user = await this.usersService.findOne(payload.sub);
    // if (!user) throw new UnauthorizedException();
    // return user;
  }
}
