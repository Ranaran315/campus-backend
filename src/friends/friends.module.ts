import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { FriendRequest, FriendRequestSchema } from './schemas/friendRequest.schema';
import { FriendRelation, FriendRelationSchema } from './schemas/friends.schema';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UsersModule } from 'src/users/users.module';
import { FriendCategory, FriendCategorySchema } from './schemas/friendsCategory.schema';
import { Conversation, ConversationSchema } from 'src/chat/schemas/conversation.schema';
import { Message, MessageSchema } from 'src/chat/schemas/message.schema';
import { UserConversationSetting, UserConversationSettingSchema } from 'src/chat/schemas/user-conversation-setting.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FriendRequest.name, schema: FriendRequestSchema },
      { name: FriendRelation.name, schema: FriendRelationSchema },
      { name: User.name, schema: UserSchema },
      { name: FriendCategory.name, schema: FriendCategorySchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: UserConversationSetting.name, schema: UserConversationSettingSchema },
    ]),
    NotificationsModule,
    forwardRef(() => UsersModule),
  ],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
