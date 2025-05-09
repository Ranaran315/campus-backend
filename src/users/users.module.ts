import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import {
  FriendRelation,
  FriendRelationSchema,
} from 'src/friends/friends.schema';

@Module({
  imports: [
    // 注册 UserSchema
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: FriendRelation.name,
        schema: FriendRelationSchema,
      },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // 导出 UsersService 以便其他模块使用
})
export class UsersModule {}
