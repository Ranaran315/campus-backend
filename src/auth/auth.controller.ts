// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';

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
}
