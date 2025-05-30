import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 配置静态文件服务
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // 全局注册响应转换拦截器
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动移除请求体中 DTO 未定义的属性
      forbidNonWhitelisted: true, // 如果传入 DTO 未定义的属性则报错
      transform: true, // 自动将传入的原始类型转换为 DTO 中定义的类型
      transformOptions: {
        enableImplicitConversion: true, // 允许基本类型的隐式转换 (例如查询参数中的字符串转数字)
      },
    }),
  );
  app.enableCors(); // 启用 CORS
  await app.listen(process.env.PORT ?? 8080);
  console.log(`应用程序正在运行于: ${await app.getUrl()}`);
}

bootstrap();
