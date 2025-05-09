// src/users/users.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema'; // 导入 Schema 和 文档类型
import { CreateUserDto } from './dto/create-user.dto';
import {
  ChangePasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
} from './dto/update-user.dto';
import * as bcrypt from 'bcrypt'; // 导入 bcrypt 用于密码哈希
import { FriendsService } from 'src/friends/friends.service';

@Injectable()
export class UsersService {
  // 注入 User 的 Mongoose Model
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => FriendsService)) // <--- 使用 @Inject 和 forwardRef 注入 FriendsService
    private readonly friendsService: FriendsService,
  ) {}

  // --- 创建用户 (CREATE) ---
  async create(createUserDto: CreateUserDto): Promise<Omit<User, 'password'>> {
    const { identifier, userType, password, ...userData } = createUserDto;

    // 1. 根据 userType 确定 username, studentId/staffId
    const username = identifier; // 使用学号/工号作为用户名
    let specificIdField = {} as { studentId?: string; staffId?: string };
    if (userType === 'student') {
      specificIdField = { studentId: identifier };
      if (!userData.classInfo) {
        throw new BadRequestException('学生用户必须提供班级信息 (classInfo)。');
      }
    } else if (userType === 'staff') {
      specificIdField = { staffId: identifier };
      if (!userData.staffInfo) {
        // 可以根据需要决定 staffInfo 是否强制要求
        // throw new BadRequestException('教职工用户必须提供教职工信息 (staffInfo)。');
        // 或者允许为空对象
        userData.staffInfo = userData.staffInfo || {};
      }
    } else {
      throw new BadRequestException('无效的用户类型。'); // 理论上 DTO 已校验，但增加保险
    }

    // 2. 检查关键信息是否重复
    const existingUser = await this.userModel
      .findOne({
        $or: [
          { username: username },
          { email: userData.email }, // 查询 email
          { phone: userData.phone }, // 查询手机号
          specificIdField.studentId
            ? { studentId: specificIdField.studentId }
            : { _id: null }, // 避免空查询条件
          specificIdField.staffId
            ? { staffId: specificIdField.staffId }
            : { _id: null },
        ],
      })
      .exec();

    if (existingUser) {
      let conflictField = '未知字段';
      if (existingUser.username === username)
        conflictField = `用户名 '${username}'`;
      else if (existingUser?.email === userData.email)
        conflictField = `邮箱 '${userData.email}'`;
      else if (existingUser.phone === userData.phone)
        conflictField = `手机号 '${userData.phone}'`;
      else if (existingUser.studentId === specificIdField.studentId)
        conflictField = `学号 '${specificIdField.studentId}'`;
      else if (existingUser.staffId === specificIdField.staffId)
        conflictField = `工号 '${specificIdField.staffId}'`;
      throw new ConflictException(`${conflictField} 已被占用。`);
    }

    // 3. 哈希密码
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. 设置默认角色 (可以根据 userType 设定)
    const defaultRoles = userType === 'student' ? ['student'] : ['staff']; // 示例

    // 5. 准备要保存的数据
    const userToCreatePayload: Partial<User> = {
      username: username,
      password: hashedPassword,
      userType: userType,
      roles: defaultRoles, // 使用默认角色
      ...specificIdField,
      realname: userData.realname,
      nickname: userData.nickname,
      gender: userData.gender,
      departmentInfo: userData.departmentInfo,
      classInfo: userType === 'student' ? userData.classInfo : undefined, // 只为学生保存班级信息
      staffInfo: userType === 'staff' ? userData.staffInfo : undefined, // 只为教职工保存教职工信息
      phone: userData.phone,
      email: userData.email,
      status: 'active', // 默认状态为 active
    };

    // 6. 创建并保存用户
    const createdUser = new this.userModel(userToCreatePayload);
    try {
      const savedUser = await createdUser.save();
      await this.friendsService.createDefaultCategoryForUser(savedUser._id);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...result } = savedUser.toObject();
      return result;
    } catch (error) {
      // 捕获可能的其他保存错误
      console.error('创建用户时出错:', error);
      throw new InternalServerErrorException('创建用户失败，请稍后重试。');
    }
  }

  // --- 查询所有用户 (READ ALL) ---
  async findAll(): Promise<Omit<User, 'password'>[]> {
    // .select('-password') 表示从结果中排除 password 字段
    return this.userModel.find().select('-password').exec(); // .exec() 返回 Promise
  }

  // --- 根据 ID 查询单个用户 (READ ONE) ---
  async findOne(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.userModel.findById(id).select('-password').exec();
    if (!user) {
      // 如果找不到用户，抛出 404 Not Found 异常
      throw new NotFoundException(`ID 为 '${id}' 的用户不存在。`);
    }
    return user;
  }

  // --- 根据用户名查询用户 (用于认证等，需要密码) ---
  async findOneByUsernameForAuth(
    username: string,
  ): Promise<UserDocument | null> {
    // 注意：这个方法返回包含密码的完整文档，仅用于内部认证逻辑
    return this.userModel.findOne({ username }).exec();
  }

  // --- 更新用户信息 （管理员） ---
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    // 查找并更新用户，{ new: true } 会返回更新后的文档
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        id,
        updateUserDto, // 要更新的数据
        { new: true }, // 选项：返回更新后的文档
      )
      .select('-password') // 同样排除密码
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`ID 为 '${id}' 的用户不存在。`);
    }
    return updatedUser;
  }

  // --- 更新用户信息 （个人） ---
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<Omit<User, 'password'>> {
    // 检查 email 和 phone 是否与其他用户冲突 (如果它们被更改)
    if (updateProfileDto.email || updateProfileDto.phone) {
      const queryConditions = [] as any[];
      if (updateProfileDto.email) {
        queryConditions.push({
          email: updateProfileDto.email,
          _id: { $ne: userId },
        });
      }
      if (updateProfileDto.phone) {
        queryConditions.push({
          phone: updateProfileDto.phone,
          _id: { $ne: userId },
        });
      }

      if (queryConditions.length > 0) {
        const existingUser = await this.userModel
          .findOne({ $or: queryConditions })
          .exec();
        if (existingUser) {
          let conflictField = '';
          if (existingUser.email === updateProfileDto.email)
            conflictField = '邮箱';
          else if (existingUser.phone === updateProfileDto.phone)
            conflictField = '手机号';
          throw new ConflictException(
            `${conflictField} '${updateProfileDto[conflictField === '邮箱' ? 'email' : 'phone']}' 已被其他用户占用。`,
          );
        }
      }
    }

    // 更新允许的字段
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateProfileDto }, // 使用 $set 确保只更新 DTO 中的字段
        { new: true },
      )
      .select('-password')
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`ID 为 '${userId}' 的用户不存在。`);
    }
    return updatedUser;
  }

  // --- 更新用户密码 ---
  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    // 1. 查找用户 (需要包含密码以进行比较)
    const user = await this.userModel
      .findById(userId)
      .select('+password')
      .exec();
    if (!user) {
      throw new NotFoundException(`ID 为 '${userId}' 的用户不存在。`);
    }

    // 2. 哈希新密码
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(
      changePasswordDto.newPassword,
      saltRounds,
    );

    // 3. 更新密码
    user.password = hashedNewPassword;
    try {
      await user.save();
    } catch (error) {
      console.error('修改密码时保存失败:', error);
      throw new InternalServerErrorException('修改密码失败，请稍后重试。');
    }
  }

  // --- 删除用户 (DELETE) ---
  async remove(id: string): Promise<void> {
    // 可以返回 void 或被删除的用户信息
    const result = await this.userModel.findByIdAndDelete(id).exec();
    if (!result) {
      // 如果找不到用户，也抛出 404 异常
      throw new NotFoundException(`ID 为 '${id}' 的用户不存在。`);
    }
    // 如果需要返回被删除的用户信息（通常不含密码）:
    // const { password, ...deletedUser } = result.toObject();
    // return deletedUser;
  }

  // --- 搜索用户 (根据用户名、昵称、真实姓名或邮箱) ---
  async searchUsers(query: string): Promise<any[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    // 构建搜索条件
    const searchRegex = new RegExp(query, 'i');

    return this.userModel
      .find({
        $or: [
          { username: searchRegex },
          { nickname: searchRegex },
          { realname: searchRegex },
          { email: searchRegex },
        ],
      })
      .select('username nickname avatar realname userType')
      .limit(10)
      .lean();
  }
}
