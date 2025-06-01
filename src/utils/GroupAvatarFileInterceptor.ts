import {
  CallHandler,
  ExecutionContext,
  Injectable,
  mixin,
  NestInterceptor,
  Type,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import * as multer from 'multer';
import { getGroupAvatarStorage } from './local-upload'; // Import the new storage function

/**
 * Creates a file interceptor specifically for group avatars.
 * It uses the groupId from route parameters to construct the storage path.
 * @param fieldName The name of the file field in the form-data.
 * @param options Multer options (limits, fileFilter).
 * @returns A custom file interceptor Type.
 */
export function GroupAvatarFileInterceptor(
  fieldName: string,
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

      const groupId = req.params?.id; // Get groupId from route params

      if (!groupId || typeof groupId !== 'string' || !/^[a-f0-9]{24}$/i.test(groupId)) {
        // Handle invalid or missing groupId
        throw new BadRequestException('无效的群组ID');
      }

      // Configure storage using the groupId
      const storage = getGroupAvatarStorage(groupId);

      const multerOptions: multer.Options = {
        storage,
        ...options,
      };

      // Create and delegate to a new FileInterceptor instance
      const fileInterceptor = new (FileInterceptor(fieldName, multerOptions))();
      return fileInterceptor.intercept(context, next);
    }
  }
  return mixin(MixinInterceptor);
} 