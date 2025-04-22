// src/users/users.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch, // 或 Put
  Param,
  Delete,
  UsePipes, // 用于管道
  ValidationPipe, // 用于数据验证
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
// 导入认证守卫等 (未来步骤)
// import { AuthGuard } from '@nestjs/passport';
// import { UseGuards } from '@nestjs/common';

@Controller('users') // 设置基础路由为 /users
// @UseGuards(AuthGuard('jwt')) // (可选) 对整个控制器启用 JWT 认证保护
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- CREATE ---
  // POST /users
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) // 应用验证管道
  async create(@Body() createUserDto: CreateUserDto) {
    // 注意：实际项目中，用户注册可能放在 AuthController 更合适
    return this.usersService.create(createUserDto);
  }

  // --- READ ALL ---
  // GET /users
  @Get()
  async findAll() {
    return this.usersService.findAll();
  }

  // --- READ ONE ---
  // GET /users/:id  (例如 /users/60b9d0f3f8e4a8b3d4e1f8b1)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    // 注意：实际项目中应对 ID 格式进行验证 (例如使用 ValidationPipe 或自定义 Pipe)
    try {
      const user = await this.usersService.findOne(id);
      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message); // 保持 404 状态码
      }
      throw error; // 其他错误则抛出
    }
  }

  // --- UPDATE ---
  // PATCH /users/:id
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    try {
      const updatedUser = await this.usersService.update(id, updateUserDto);
      return updatedUser;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message); // 保持 404 状态码
      }
      throw error; // 其他错误则抛出
    }
  }

  // --- DELETE ---
  // DELETE /users/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // 通常 DELETE 成功返回 204 No Content
  async remove(@Param('id') id: string) {
    try {
      await this.usersService.remove(id);
      // 成功时不返回内容
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message); // 保持 404 状态码
      }
      throw error; // 其他错误则抛出
    }
  }
}

// **重要提示**: 为了让 DTO 的验证生效（例如使用 class-validator 装饰器），
// 你需要在 `src/main.ts` 中全局启用 ValidationPipe:
// import { ValidationPipe } from '@nestjs/common';
// ...
// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   app.useGlobalPipes(new ValidationPipe({
//     whitelist: true, // 自动移除 DTO 中未定义的属性
//     forbidNonWhitelisted: true, // 如果有多余属性则报错
//     transform: true, // 自动转换传入参数类型 (例如 string -> number)
//   }));
//   await app.listen(3000);
// }
// bootstrap();
