import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AcademicClassController } from './academic-class.controller';
import { AcademicClassService } from './academic-class.service';
import {
  AcademicClass,
  AcademicClassSchema,
} from './schemas/academic-class.schema';
import { Major, MajorSchema } from '../major/schemas/major.schema';
import { College, CollegeSchema } from '../college/schemas/college.schema';
import { User, UserSchema } from '../users/user.schema'; // Corrected path
// import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AcademicClass.name, schema: AcademicClassSchema },
      { name: Major.name, schema: MajorSchema },
      { name: College.name, schema: CollegeSchema }, // Though college is derived, MajorSchema might populate it.
      { name: User.name, schema: UserSchema },
    ]), // Corrected: ensure this array is properly closed
    // AuthModule, // If guards/auth features are needed
  ],
  controllers: [AcademicClassController],
  providers: [AcademicClassService],
  exports: [AcademicClassService], // If other modules need to use AcademicClassService
})
export class AcademicClassModule {}
