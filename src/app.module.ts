import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose'; // MongooseModule
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { FriendsController } from './friends/friends.controller';
import { FriendsModule } from './friends/friends.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RoleModule } from './role/role.module';
import { AdminModule } from './admin/admin.module';
import { CollegeModule } from './college/college.module';
import { MajorModule } from './major/major.module';
import { AcademicClassModule } from './academic-class/academic-class.module';
import { InformModule } from './inform/inform.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    // --- 配置模块 ---
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // --- MongoDB 模块 ---
    MongooseModule.forRootAsync({
      // 示例：Mongoose 也使用 ConfigService
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'), // 假设 .env 有 MONGODB_URI
      }),
      inject: [ConfigService],
    }),
    // --- JWT 模块 ---
    JwtModule.registerAsync({
      // Or JwtModule.register if not using async/config
      imports: [ConfigModule], // Import ConfigModule if using ConfigService
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'), // Make sure JWT_SECRET is defined in your .env and loaded
        // Or directly: secret: 'YOUR_HARDCODED_SECRET', (Not recommended for production)
        signOptions: { expiresIn: configService.get<string>('JWT_EXPIRES_IN') }, // Optional: ensure consistency
      }),
      inject: [ConfigService], // Inject ConfigService if using it
      global: true, // Make JwtService available globally, simplifying injection
    }),
    // --- 其它模块 ---
    UsersModule,
    AuthModule,
    FriendsModule,
    NotificationsModule,
    RoleModule,
    AdminModule,
    CollegeModule,
    MajorModule,
    AcademicClassModule,
    InformModule,
    ChatModule,
  ],
  controllers: [AppController, AuthController, FriendsController],
  providers: [AppService, AuthService],
})
export class AppModule {}
