// src/admin/admin.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Inject,
} from '@nestjs/common';
import { AdminGuard } from './guards/admin.guard'; // 假设你有一个 AdminGuard
import { ImportUsersDto } from './dto/import-users.dto';
import { UsersService } from '../users/users.service'; // 注入 UsersService

@Controller('admin') // 基础路由 /admin
@UseGuards(AdminGuard) // 使用 AdminGuard 保护此控制器下的所有路由
export class AdminController {
  // 注入 UsersService 来调用创建用户的逻辑
  constructor(private readonly usersService: UsersService) {}

  @Post('import-users') // API 端点： POST /admin/import-users
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  ) // 使用管道进行数据验证和转换
  async importUsers(@Body() importUsersDto: ImportUsersDto) {
    // 调用 Service 层进行批量处理
    const result = await this.usersService.importUsersBatch(
      importUsersDto.users,
    );
    return {
      message: 'User import process finished.',
      results: result, // 返回处理结果总结
    };
  }
}

// 需要创建 AdminGuard 来验证用户是否是管理员
// src/admin/guards/admin.guard.ts (简单示例)
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // 假设之前的认证守卫已将 user 对象附加到 request 上
    // 检查用户是否存在且 roles 数组中包含 'admin'
    return user && user.roles && user.roles.includes('admin');
  }
}

// 别忘了在 AdminModule 中导入 UsersModule (如果需要注入 UsersService)
// 并在 AppModule 中导入 AdminModule// src/admin/admin.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Inject,
} from '@nestjs/common';
import { AdminGuard } from './guards/admin.guard'; // 假设你有一个 AdminGuard
import { ImportUsersDto } from './dto/import-users.dto';
import { UsersService } from '../users/users.service'; // 注入 UsersService

@Controller('admin') // 基础路由 /admin
@UseGuards(AdminGuard) // 使用 AdminGuard 保护此控制器下的所有路由
export class AdminController {
  // 注入 UsersService 来调用创建用户的逻辑
  constructor(private readonly usersService: UsersService) {}

  @Post('import-users') // API 端点： POST /admin/import-users
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  ) // 使用管道进行数据验证和转换
  async importUsers(@Body() importUsersDto: ImportUsersDto) {
    // 调用 Service 层进行批量处理
    const result = await this.usersService.importUsersBatch(
      importUsersDto.users,
    );
    return {
      message: 'User import process finished.',
      results: result, // 返回处理结果总结
    };
  }
}

// 需要创建 AdminGuard 来验证用户是否是管理员
// src/admin/guards/admin.guard.ts (简单示例)
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // 假设之前的认证守卫已将 user 对象附加到 request 上
    // 检查用户是否存在且 roles 数组中包含 'admin'
    return user && user.roles && user.roles.includes('admin');
  }
}

// 别忘了在 AdminModule 中导入 UsersModule (如果需要注入 UsersService)
// 并在 AppModule 中导入 AdminModule
