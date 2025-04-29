// filepath: d:\大学资料\论文毕设\毕设\campus-backend\src\common\interceptors\transform.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus, // 导入 HttpStatus
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  statusCode: number;
  message: string;
  data: T | null;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, StandardResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse(); // 获取原始响应对象
    const request = ctx.getRequest(); // 获取原始请求对象

    return next.handle().pipe(
      map((data) => ({
        statusCode: response.statusCode, // 使用 NestJS 设置的 HTTP 状态码
        message: '请求成功', // 可以根据需要自定义成功消息
        data: data === undefined ? null : data, // 如果控制器没有返回数据，则 data 为 null
      })),
    );
  }
}
