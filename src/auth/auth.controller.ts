// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService, // 注入 UsersService 用于注册
  ) {}

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    // 注意：全局 ValidationPipe 会自动验证 createUserDto
    try {
      const user: any = await this.usersService.create(createUserDto);
      // 注册成功，不返回敏感信息，可以只返回 ID 或成功消息
      return { message: '注册成功', userId: user._id };
    } catch (error) {
      // Service 层抛出的异常会被 NestJS 框架捕获并返回给客户端
      // 例如 ConflictException 会返回 409
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK) // 登录成功返回 200 OK
  async login(@Body() loginDto: LoginDto) {
    // 全局 ValidationPipe 会自动验证 loginDto
    const validatedUser = await this.authService.validateUser(
      loginDto.username,
      loginDto.password,
    );
    if (!validatedUser) {
      throw new UnauthorizedException('用户名或密码错误'); // 返回 401
    }
    return this.authService.login(validatedUser); // 返回 { access_token: ... }
  }

  // --- 退出登录 ---
  // POST /auth/logout
  @UseGuards(JwtAuthGuard) // 确保用户已登录才能调用退出
  @Post('logout')
  @HttpCode(HttpStatus.OK) // 成功退出返回 200 OK
  async logout(@Request() req) {
    // 服务端对于无状态 JWT 通常无需操作
    // req.user 包含 { userId, username, roles } 可用于记录日志等（如果需要）
    console.log(
      `用户 ${req.user.username} (ID: ${req.user.userId}) 请求退出登录`,
    );

    // 如果未来实现 Token 黑名单，可以在这里处理
    // await this.authService.blacklistToken(req.headers.authorization.split(' ')[1]);

    // TransformInterceptor 会自动包装响应
    // 可以不返回任何 data，拦截器会处理
    // return; // 或者返回一个空对象或 null
    // 或者明确返回一个消息
    return { message: '退出登录成功' };
  }
}
