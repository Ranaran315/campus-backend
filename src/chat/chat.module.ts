import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, MessageSchema } from './schemas/message.schema';
import {
  Conversation,
  ConversationSchema,
} from './schemas/conversation.schema';
import {
  UserConversationSetting,
  UserConversationSettingSchema,
} from './schemas/user-conversation-setting.schema';
import { ChatGroup, ChatGroupSchema } from './schemas/chat-group.schema';
import { MessageService } from './messages.service';
import { ConversationService } from './conversation.service';
import { GroupService } from './group.service';
import { ChatController } from './chat.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
      {
        name: UserConversationSetting.name,
        schema: UserConversationSettingSchema,
      },
      { name: ChatGroup.name, schema: ChatGroupSchema },
    ]),
    forwardRef(() => UsersModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => FriendsModule),
  ],
  providers: [MessageService, ConversationService, GroupService],
  controllers: [ChatController],
  exports: [MessageService, ConversationService, GroupService],
})
export class ChatModule {}
