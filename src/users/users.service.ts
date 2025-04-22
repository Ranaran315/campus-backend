// src/users/users.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto'; // DTO 用于数据传输和验证
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt'; // 引入 bcrypt 用于密码哈希

@Injectable()
export class UsersService {
  constructor(
    // 注入 Mongoose User Model
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // === CREATE ===
  async create(createUserDto: CreateUserDto): Promise<User> {
    // 检查用户名或邮箱是否已存在 (可选，取决于 Schema 的 unique 约束处理方式)
    const existingUser = await this.userModel
      .findOne({
        $or: [
          { username: createUserDto.username },
          { email: createUserDto.email },
        ],
      })
      .exec();
    if (existingUser) {
      throw new ConflictException('Username or Email already exists');
    }

    // **重要：密码哈希**
    const saltRounds = 10; // 哈希计算轮数
    const hashedPassword = await bcrypt.hash(
      createUserDto.password,
      saltRounds,
    );

    const createdUser = new this.userModel({
      ...createUserDto,
      password: hashedPassword, // 存储哈希后的密码
    });
    return createdUser.save(); // 保存到数据库
  }

  // === READ ALL ===
  async findAll(): Promise<User[]> {
    // .select('-password') 可以在这里排除密码字段，虽然 schema 里设置了 select: false
    return this.userModel.find().select('-password').exec();
  }

  // === READ ONE by ID ===
  async findOne(id: string): Promise<User> {
    const user = await this.userModel.findById(id).select('-password').exec();
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user;
  }

  // === READ ONE by Username (示例：登录时可能需要) ===
  async findOneByUsername(username: string): Promise<User | undefined> {
    // 登录验证时需要查询密码，所以不加 select('-password')
    return this.userModel.findOne({ username: username }).exec();
  }

  // === UPDATE ===
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    // 如果更新数据中包含密码，也需要哈希处理
    if (updateUserDto.password) {
      const saltRounds = 10;
      updateUserDto.password = await bcrypt.hash(
        updateUserDto.password,
        saltRounds,
      );
    } else {
      // 如果 DTO 中没传密码，确保不要将 undefined 写入数据库
      delete updateUserDto.password;
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        id,
        updateUserDto,
        { new: true }, // { new: true } 返回更新后的文档
      )
      .select('-password')
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return updatedUser;
  }

  // === DELETE ===
  async remove(id: string): Promise<User> {
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    // 通常不返回密码，但 findByIdAndDelete 返回的是删除前的文档
    // 如果需要，可以手动处理一下
    deletedUser.password = ''; // 避免返回密码
    return deletedUser;
  }
}
