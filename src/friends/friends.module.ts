import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { FriendRelation, FriendRelationSchema } from './schemas/friends.schema';
import {
  FriendRequest,
  FriendRequestSchema,
} from './schemas/friendRequest.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UsersModule } from 'src/users/users.module';
import {
  FriendCategory,
  FriendCategorySchema,
} from './schemas/friendsCategory.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FriendRelation.name, schema: FriendRelationSchema },
      { name: FriendRequest.name, schema: FriendRequestSchema },
      { name: FriendCategory.name, schema: FriendCategorySchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule, // 引入NotificationsModule
    forwardRef(() => UsersModule),
  ],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
