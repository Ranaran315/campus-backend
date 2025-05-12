// src/users/users.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import {
  ChangePasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
} from './dto/update-user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Types } from 'mongoose';

// 在 main.ts 中启用全局管道，或者在这里为特定控制器/路由启用
// @UsePipes(new ValidationPipe(...))

@Controller('users') // 定义基础路由为 /users
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- 获取当前登录用户的信息 ---
  // GET /users/me
  @UseGuards(JwtAuthGuard) // 使用 JWT 守卫保护此路由
  @Get('me')
  getProfile(@Request() req) {
    // JwtAuthGuard 会将解码后的用户信息附加到 req.user
    // JwtStrategy 中的 validate 方法决定了 req.user 的内容
    // 根据你的 JwtStrategy，req.user 包含 { userId, username, roles }
    const userId = req.user._id;
    // 调用 findOne 获取完整的用户信息（不含密码）
    return this.usersService.findOneById(userId);
  }

  // --- 创建用户 ---
  // POST /users
  @Post()
  // @UsePipes(new ValidationPipe({...})) // 如果没在全局启用，可以在这里启用
  create(@Body() createUserDto: CreateUserDto) {
    // @Body() 获取请求体并绑定到 DTO
    return this.usersService.create(createUserDto);
  }

  // --- 获取所有用户 ---
  // GET /users
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // --- 搜索用户 ---
  @Get('search')
  async searchUsers(@Query('q') query: string) {
    return this.usersService.searchUsers(query);
  }

  // --- 获取单个用户 ---
  // GET /users/:id (例如 /users/662695e1...)
  @Get(':id')
  // 可以添加 Pipe 来验证 ID 格式，例如 Mongoose ObjectId 格式
  // findOne(@Param('id', YourMongoIdValidationPipe) id: string) {
  findOne(@Param('id') id: string) {
    // @Param('id') 获取 URL 中的 id 参数
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('无效的用户ID格式');
    }
    return this.usersService.findOneById(id);
  }

  // --- 更新用户 ---
  // PATCH /users/:id
  @Patch(':id')
  // @UsePipes(new ValidationPipe({...}))
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  // --- 更新当前用户的个人信息 ---
  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  updateProfile(@Request() req, @Body() updateProfileDto: UpdateProfileDto) {
    const userId = req.user._id;
    return this.usersService.updateProfile(userId, updateProfileDto);
  }

  // --- 修改当前用户的密码 ---
  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const userId = req.user._id;
    await this.usersService.changePassword(userId, changePasswordDto);
    // 成功时不一定需要返回数据，可以返回成功消息或状态码
    return { message: '密码修改成功。' };
  }

  // --- 删除用户 ---
  // DELETE /users/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // 设置成功响应状态码为 204 No Content
  remove(@Param('id') id: string) {
    // Service 中已处理 Not Found 异常
    return this.usersService.remove(id); // 注意 remove 方法现在返回 void
  }
}
