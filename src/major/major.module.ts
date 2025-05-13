import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MajorController } from './major.controller';
import { MajorService } from './major.service';
import { Major, MajorSchema } from './schemas/major.schema';
import { College, CollegeSchema } from '../college/schemas/college.schema'; // 导入 College 以便 Service 注入
// import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Major.name, schema: MajorSchema },
      { name: College.name, schema: CollegeSchema }, // 注册 CollegeSchema 供 MajorService 使用
    ]), // Corrected: Added closing parenthesis for forFeature array
    // AuthModule,
  ],
  controllers: [MajorController],
  providers: [MajorService],
  exports: [MajorService],
})
export class MajorModule {}
