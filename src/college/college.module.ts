import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CollegeController } from './college.controller';
import { CollegeService } from './college.service';
import { College, CollegeSchema } from './schemas/college.schema';
import { UsersModule } from '../users/users.module';
// import { AuthModule } from '../auth/auth.module'; // 如果需要集成认证授权

@Module({
  imports: [
    MongooseModule.forFeature([{ name: College.name, schema: CollegeSchema }]),
    forwardRef(() => UsersModule),
    // AuthModule, // 如果你的守卫等依赖于AuthModule提供的服务
  ],
  controllers: [CollegeController],
  providers: [CollegeService],
  exports: [CollegeService], // 如果其他模块需要使用CollegeService
})
export class CollegeModule {}
