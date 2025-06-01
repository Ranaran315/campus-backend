import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extname, join } from 'path';
// import { transformIdToString } from './transform'; // transformIdToString might no longer be needed if userId is expected as string or ObjectId

/**
 * 增强版通用本地上传存储工厂 - 支持用户级别目录
 * @param type 业务类型，如 avatar/chat/inform-attachments/images 等
 * @param options 额外选项，如用户ID (期望是string或具有toString方法的对象)
 * @returns Multer diskStorage 配置
 */
export function getUserMulterStorage(
  type: string,
  options?: { userId?: string | { toString: () => string } }, // More specific type for userId
) {
  // 验证业务类型
  const safeType = type && /^[\w-]+$/.test(type) ? type : 'other';

  // 构建基础路径
  let basePath = join(process.cwd(), 'uploads', safeType);

  // 如果提供了userId，则在路径中添加用户ID目录
  if (options?.userId) {
    const userIdStr = typeof options.userId === 'string' ? options.userId : options.userId.toString();
    let directoryName = '';

    if (/^[a-f0-9]{24}$/i.test(userIdStr)) { // 标准 MongoDB ObjectId 字符串 (24位十六进制)
      directoryName = userIdStr;
    } else {
      // 对于非标准 ObjectId 字符串，进行清理
      // console.warn(`User ID '${userIdStr}' is not a standard ObjectId. Applying sanitization.`); // 可选日志
      const sanitized = userIdStr.replace(/[^a-zA-Z0-9-_]/g, '');
      if (sanitized) {
        directoryName = sanitized;
      } else {
        // console.warn(`User ID '${userIdStr}' sanitized to an empty string. Not creating user-specific directory.`); // 可选日志
      }
    }

    if (directoryName) {
      basePath = join(basePath, directoryName);
    }
  }

  // 确保目录存在
  if (!existsSync(basePath)) {
    mkdirSync(basePath, { recursive: true });
  }

  return diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, basePath);
    },
    filename: (_req, file, cb) => {
      // 生成唯一文件名，防止覆盖
      const uniqueName = uuidv4() + extname(file.originalname);
      cb(null, uniqueName);
    },
  });
}

// New storage function for group avatars
export function getGroupAvatarStorage(groupId: string) {
  const safeGroupId = groupId && /^[a-f0-9]{24}$/i.test(groupId) ? groupId : 'invalid-group-id';
  const basePath = join(process.cwd(), 'uploads', 'group-avatars', safeGroupId);

  if (!existsSync(basePath)) {
    mkdirSync(basePath, { recursive: true });
  }

  return diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, basePath);
    },
    filename: (_req, file, cb) => {
      const uniqueName = uuidv4() + extname(file.originalname);
      cb(null, uniqueName);
    },
  });
}

// 保留原来的函数以保持兼容性
export function getGeneralMulterStorage(type: string) {
  return getUserMulterStorage(type);
}

/**
 * 动态创建按用户分组的Multer存储中间件
 * @param type 业务类型
 * @returns Multer选项创建函数
 */
export function createUserStorageMiddleware(type: string) {
  return (req, _file, cb) => {
    // 从请求中获取用户ID
    const userId = req.user?._id?.toString();

    // 创建存储配置
    const storage = getUserMulterStorage(type, { userId });

    // 调用回调，传递存储配置
    cb(null, { storage });
  };
}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  mixin,
  NestInterceptor,
  Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import * as multer from 'multer';

/**
 * 创建用户文件上传拦截器 - 解决动态获取用户ID的问题
 * @param fieldName 文件字段名称
 * @param fileType 文件业务类型 (如 avatars, inform-attachments 等)
 * @param options 文件上传选项
 * @returns 自定义文件拦截器
 */
export function UserFileInterceptor(
  fieldName: string,
  fileType: string,
  options: {
    limits?: {
      fileSize?: number;
      files?: number;
    };
    fileFilter?: (
      req: any,
      file: any,
      callback: (error: Error | null, acceptFile: boolean) => void,
    ) => void;
  } = {},
): Type<NestInterceptor> {
  @Injectable()
  class MixinInterceptor implements NestInterceptor {
    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<any>> {
      const ctx = context.switchToHttp();
      const req = ctx.getRequest();

      // 从请求中获取用户ID
      const userId = req.user?._id?.toString();

      if (!userId) {
        throw new Error('未能获取用户ID，请确保此路由受到 JwtAuthGuard 保护');
      }

      // 配置上传使用的存储选项
      const storage = getUserMulterStorage(fileType, { userId });

      // 创建 Multer 配置
      const multerOptions = {
        storage,
        ...options,
      };

      // 创建 FileInterceptor
      const fileInterceptor = new (FileInterceptor(fieldName, multerOptions))();

      // 委托给标准 FileInterceptor 处理
      return fileInterceptor.intercept(context, next);
    }
  }

  return mixin(MixinInterceptor);
}
