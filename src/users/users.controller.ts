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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// 在 main.ts 中启用全局管道，或者在这里为特定控制器/路由启用
// @UsePipes(new ValidationPipe(...))

@Controller('users') // 定义基础路由为 /users
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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

  // --- 获取单个用户 ---
  // GET /users/:id (例如 /users/662695e1...)
  @Get(':id')
  // 可以添加 Pipe 来验证 ID 格式，例如 Mongoose ObjectId 格式
  // findOne(@Param('id', YourMongoIdValidationPipe) id: string) {
  findOne(@Param('id') id: string) {
    // @Param('id') 获取 URL 中的 id 参数
    return this.usersService.findOne(id);
  }

  // --- 更新用户 ---
  // PATCH /users/:id
  @Patch(':id')
  // @UsePipes(new ValidationPipe({...}))
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
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
