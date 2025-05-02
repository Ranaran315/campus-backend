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
import { FriendsNoSpecService } from './friends--no-spec/friends--no-spec.service';
import { FriendsNoSpecController } from './friends--no-spec/friends--no-spec.controller';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://127.0.0.1:27017/campus'),
    UsersModule,
    AuthModule,
    FriendsModule,
  ],
  controllers: [AppController, AuthController, FriendsController, FriendsNoSpecController],
  providers: [AppService, AuthService, FriendsNoSpecService],
})
export class AppModule {}
