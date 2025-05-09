import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { FriendCategory, FriendCategorySchema, FriendRelation, FriendRelationSchema } from './friends.schema';
import { FriendRequest, FriendRequestSchema } from './friendRequest.schema';
import { User, UserSchema } from '../users/user.schema';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FriendRelation.name, schema: FriendRelationSchema },
      { name: FriendRequest.name, schema: FriendRequestSchema },
      { name: FriendCategory.name, schema: FriendCategorySchema, },
      { name: User.name, schema: UserSchema }
    ]),
    NotificationsModule, // 引入NotificationsModule
    UsersModule // 引入UsersModule
  ],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService]
})
export class FriendsModule { }