// src/users/users.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserImportItemDto } from '../admin/dto/import-users.dto'; // 导入 DTO
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  // ... (保留之前的 CRUD 方法) ...

  // === BATCH IMPORT METHOD ===
  async importUsersBatch(usersData: UserImportItemDto[]): Promise<object> {
    const results = {
      createdCount: 0,
      skippedCount: 0,
      errorCount: 0,
      errors: [],
    };
    const defaultPassword = '123456'; // 设置默认密码
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds); // 预先哈希默认密码

    for (const userData of usersData) {
      try {
        const username = userData.identifier; // 使用 identifier 作为 username
        let specificIdField = {};
        if (userData.userType === 'student') {
          specificIdField = { studentId: userData.identifier };
        } else if (userData.userType === 'staff') {
          specificIdField = { staffId: userData.identifier };
        }

        // 检查用户是否已存在 (通过 username, email, 或 identifier)
        const existingUser = await this.userModel
          .findOne({
            $or: [
              { username: username },
              { email: userData.email },
              // 如果 studentId/staffId 也要求唯一，可以加入检查
              // specificIdField
            ],
          })
          .exec();

        if (existingUser) {
          console.warn(
            `Skipping existing user: username=${username}, email=${userData.email}`,
          );
          results.skippedCount++;
          continue; // 跳过已存在的用户
        }

        // 准备要插入的数据
        const newUserPayload: Partial<User> = {
          username: username,
          name: userData.name,
          email: userData.email,
          password: hashedPassword, // 使用哈希后的默认密码
          roles: userData.roles,
          userType: userData.userType,
          ...specificIdField, // 添加 studentId 或 staffId
          departmentInfo: userData.departmentInfo,
          classInfo:
            userData.userType === 'student' ? userData.classInfo : undefined,
          staffInfo:
            userData.userType === 'staff' ? userData.staffInfo : undefined,
          // 注意: Mongoose Schema 的 timestamps: true 会自动添加 createdAt, updatedAt
        };

        const createdUser = new this.userModel(newUserPayload);
        await createdUser.save();
        results.createdCount++;
      } catch (error) {
        console.error(
          `Failed to import user with identifier ${userData.identifier}:`,
          error,
        );
        results.errorCount++;
        results.errors.push({
          identifier: userData.identifier,
          error: error.message,
        });
        // 根据策略决定是否继续处理下一个用户
      }
    }

    return results; // 返回处理结果总结
  }
}
