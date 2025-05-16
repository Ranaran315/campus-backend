import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InformController } from './inform.controller';
import { InformService } from './inform.service';
import { Inform, InformSchema } from './schemas/inform.schema';
import {
  InformReceipt,
  InformReceiptSchema,
} from './schemas/inform-receipt.schema';
import {
  InformComment,
  InformCommentSchema,
} from './schemas/inform-comment.schema';
import { UsersModule } from '../users/users.module';
import { CollegeModule } from '../college/college.module';
import { MajorModule } from '../major/major.module';
import { AcademicClassModule } from '../academic-class/academic-class.module';
import { RoleModule } from '../role/role.module';
import { NotificationsModule } from '../notifications/notifications.module'; // 用于实时通知

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Inform.name, schema: InformSchema },
      { name: InformReceipt.name, schema: InformReceiptSchema },
      { name: InformComment.name, schema: InformCommentSchema },
    ]),
    forwardRef(() => UsersModule), // InformService 可能需要 UsersService
    // 如果 UsersService 也需要 InformService (例如，在删除用户时清理其通知)，则 UsersModule 也需要 forwardRef
    CollegeModule, // 用于按学院发送通知时验证学院ID或获取学院用户
    MajorModule, // 用于按专业发送通知
    AcademicClassModule, // 用于按班级发送通知
    RoleModule, // 用于按角色发送通知及权限校验
    NotificationsModule, // 注入 NotificationsGateway 以发送实时提醒
  ],
  controllers: [InformController],
  providers: [InformService], // InformCommentsService 可以后续添加或整合进 InformService
  exports: [InformService], // 如果其他模块需要直接使用 InformService
})
export class InformModule {}
