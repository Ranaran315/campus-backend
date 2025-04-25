import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module'; // 导入 UsersModule
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy'; // 稍后创建

@Module({
  imports: [
    UsersModule, // 导入 UsersModule 以便注入 UsersService
    PassportModule.register({ defaultStrategy: 'jwt' }), // 推荐注册默认策略
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'THIS_IS_A_VERY_BAD_SECRET_CHANGE_IT', // !! 极不安全，必须替换并使用环境变量 !!
      signOptions: { expiresIn: '7d' }, // Token 有效期，例如 7 天
    }),
  ],
  providers: [AuthService, JwtStrategy], // 注册 AuthService 和 JwtStrategy
  controllers: [AuthController],
  exports: [AuthService, PassportModule, JwtModule], // 导出 AuthService 和 Passport/JWT 模块供其他地方使用
})
export class AuthModule {}
