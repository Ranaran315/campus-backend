import { forwardRef, Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import { FriendsModule } from 'src/friends/friends.module';
import { RoleModule } from 'src/role/role.module';
import { CollegeModule } from 'src/college/college.module';
import { MajorModule } from 'src/major/major.module';
import { AcademicClassModule } from 'src/academic-class/academic-class.module';

@Module({
  imports: [
    // 注册 UserSchema
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
    forwardRef(() => FriendsModule),
    RoleModule,
    CollegeModule,
    MajorModule,
    AcademicClassModule
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // 导出 UsersService 以便其他模块使用
})
export class UsersModule {}
