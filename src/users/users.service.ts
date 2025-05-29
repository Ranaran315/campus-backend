// src/users/users.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema'; // 导入 Schema 和 文档类型
import { CreateUserDto } from './dto/create-user.dto';
import {
  ChangePasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
} from './dto/update-user.dto';
import * as bcrypt from 'bcrypt'; // 导入 bcrypt 用于密码哈希
import { FriendsService } from 'src/friends/friends.service';
import { RoleService } from 'src/role/role.service';
import { transformObjectId } from 'src/utils/transform';
import { CollegeService } from 'src/college/college.service';
import { AcademicClassService } from 'src/academic-class/academic-class.service';
import { MajorService } from 'src/major/major.service';

@Injectable()
export class UsersService {
  // 注入 User 的 Mongoose Model
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => FriendsService)) // <--- 使用 @Inject 和 forwardRef 注入 FriendsService
    private readonly friendsService: FriendsService,
    private readonly roleService: RoleService, // 角色服务
    private readonly collegeService: CollegeService, // 新增
    private readonly majorService: MajorService, // 新增
    private readonly academicClassService: AcademicClassService, // 新增
  ) {}

  private readonly logger = new Logger(UsersService.name); // 添加日志记录器

  // --- 创建用户 (CREATE) ---
  async create(createUserDto: CreateUserDto): Promise<Omit<User, 'password'>> {
    const {
      identifier,
      userType,
      password,
      collegeId,
      majorId,
      academicClassId,
      staffInfo: staffInfoDto,
      ...userData
    } = createUserDto;

    // 1. 根据 userType 确定 username, studentId/staffId
    const username = identifier; // 使用学号/工号作为用户名
    let specificIdField = {} as { studentId?: string; staffId?: string };

    // 验证学院 ID
    const collegeObjectId = transformObjectId(collegeId);
    const collegeDoc = await this.collegeService.findOne(collegeObjectId);
    if (!collegeDoc) {
      throw new BadRequestException(`学院 ID '${collegeId}' 不存在。`);
    }

    // 验证班级 ID
    let majorObjectId: Types.ObjectId | undefined;
    if (majorId) {
      majorObjectId = transformObjectId(majorId);
      const majorDoc = await this.majorService.findOne(majorObjectId);
      if (!majorDoc) {
        throw new BadRequestException(`专业 ID '${majorId}' 不存在。`);
      }
      // 验证专业是否属于指定的学院
      if (
        !majorDoc.college ||
        // @ts-ignore
        !(majorDoc.college._id instanceof Types.ObjectId) ||
        // @ts-ignore
        !majorDoc.college._id.equals(collegeObjectId)
      ) {
        throw new BadRequestException(
          `专业 '${majorDoc.name}' 不属于学院 '${collegeDoc.name}'。`,
        );
      }
    }

    // 验证班级
    let academicClassObjectId: Types.ObjectId | undefined;
    if (userType === 'student' && academicClassId) {
      academicClassObjectId = transformObjectId(academicClassId);
      const academicClassDoc = await this.academicClassService.findOne(
        academicClassObjectId,
      );
      if (!academicClassDoc) {
        throw new BadRequestException(`班级 ID '${academicClassId}' 不存在。`);
      }
      // 验证班级是否属于指定的专业和学院
      if (
        (majorObjectId && !academicClassDoc.major) ||
        // @ts-ignore
        !(academicClassDoc.major._id instanceof Types.ObjectId) ||
        // @ts-ignore
        !academicClassDoc.major._id.equals(majorObjectId)
      ) {
        throw new BadRequestException(
          `班级 '${academicClassDoc.name}' 不属于指定的专业。`,
        );
      }
      if (
        !academicClassDoc.college ||
        // @ts-ignore
        !(academicClassDoc.college._id instanceof Types.ObjectId) ||
        // @ts-ignore
        !academicClassDoc.college._id.equals(collegeObjectId)
      ) {
        throw new BadRequestException(
          `班级 '${academicClassDoc.name}' 不属于指定的学院。`,
        );
      }
    } else if (userType === 'student' && !academicClassId) {
      // 根据业务需求，学生是否必须有关联班级
      throw new BadRequestException(
        '学生用户必须提供班级信息 (academicClassId)。',
      );
    }

    if (userType === 'student') {
      specificIdField = { studentId: identifier };
      // 移除旧的 classInfo 检查: if (!userData.classInfo)
    } else if (userType === 'staff') {
      specificIdField = { staffId: identifier };
      // 移除旧的 staffInfo 检查: if (!userData.staffInfo)
    } else {
      throw new BadRequestException('无效的用户类型。');
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
    let defaultRoleIds: Types.ObjectId[] = [];
    const defaultRoleName = userType === 'student' ? 'student' : 'staff';
    try {
      const roleDoc = await this.roleService.findByName(defaultRoleName);
      if (roleDoc) {
        defaultRoleIds.push(roleDoc._id as unknown as Types.ObjectId);
      } else {
        // 处理默认角色不存在的情况
        // 可以选择抛出错误，或者记录日志并继续（用户将没有默认角色）
        console.warn(
          `Default role '${defaultRoleName}' not found. User will be created without this default role.`,
        );
        // throw new InternalServerErrorException(`Default role '${defaultRoleName}' configuration missing.`);
      }
    } catch (error) {
      // 如果 findByName 抛出 NotFoundException，也意味着角色不存在
      if (error instanceof NotFoundException) {
        console.warn(
          `Default role '${defaultRoleName}' not found via findByName. User will be created without this default role.`,
        );
      } else {
        // 其他可能的错误，例如数据库连接问题
        console.error(
          `Error fetching default role '${defaultRoleName}':`,
          error,
        );
        throw new InternalServerErrorException(
          'Failed to fetch default role information.',
        );
      }
    }

    // 5. 准备要保存的数据
    const userToCreatePayload: Partial<User> = {
      username: username,
      password: hashedPassword,
      userType: userType,
      roles: defaultRoleIds,
      ...specificIdField,
      realname: userData.realname,
      nickname: userData.nickname,
      gender: userData.gender,
      phone: userData.phone,
      email: userData.email,
      status: 'active',
      college: collegeObjectId, // 使用验证过的 ObjectId
      major: majorObjectId, // 使用验证过的 ObjectId (如果存在)
    };

    if (userType === 'student' && academicClassObjectId) {
      userToCreatePayload.academicClass = academicClassObjectId;
    }

    if (userType === 'staff' && staffInfoDto) {
      userToCreatePayload.staffInfo = {
        officeLocation: staffInfoDto.officeLocation,
        title: staffInfoDto.title,
      };
      if (staffInfoDto.departmentId) {
        const staffDeptObjectId = transformObjectId(staffInfoDto.departmentId);
        const staffDeptCollege =
          await this.collegeService.findOne(staffDeptObjectId);
        if (!staffDeptCollege) {
          throw new BadRequestException(
            `教职工信息中的部门ID '${staffInfoDto.departmentId}' 不存在。`,
          );
        }
        // 确保教职工的部门与用户的主要学院信息一致（如果业务要求如此）
        // if (!staffDeptObjectId.equals(collegeObjectId)) {
        //   throw new BadRequestException(`教职工的所属部门必须与其主要学院信息一致。`);
        // }
        userToCreatePayload.staffInfo.department = staffDeptObjectId;
      }
      if (
        staffInfoDto.managedClassIds &&
        staffInfoDto.managedClassIds.length > 0
      ) {
        userToCreatePayload.staffInfo.managedClasses = [];
        for (const classId of staffInfoDto.managedClassIds) {
          const managedClassObjectId = transformObjectId(classId);
          const managedClassDoc =
            await this.academicClassService.findOne(managedClassObjectId);
          if (!managedClassDoc) {
            throw new BadRequestException(
              `教职工管理的班级ID '${classId}' 不存在。`,
            );
          }
          // 可选：验证管理的班级是否属于该教职工所在的学院
          // if (!managedClassDoc.college || !transformObjectId(managedClassDoc.college as Types.ObjectId).equals(userToCreatePayload.staffInfo.department || collegeObjectId)) {
          //   throw new BadRequestException(`教职工管理的班级 '${managedClassDoc.name}' 不属于教职工所在部门/学院。`);
          // }
          userToCreatePayload.staffInfo.managedClasses.push(
            managedClassObjectId,
          );
        }
      }
    }

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
  async findAll(): Promise<UserDocument[]> {
    // .select('-password') 表示从结果中排除 password 字段
    return this.userModel.find().select('-password').exec(); // .exec() 返回 Promise
  }

  // 管理员专用：获取所有用户（带关联信息）
  async findAllWithRelations(): Promise<UserDocument[]> {
    return this.userModel
      .find()
      .select('-password')
      .populate({ path: 'college', model: 'College' })
      .populate({ path: 'major', model: 'Major' })
      .populate({ path: 'academicClass', model: 'AcademicClass' })
      .exec();
  }

  // --- 根据 ID 查询单个用户 (READ ONE) ---
  async findOneById(
    id: string | Types.ObjectId,
    populateRoles: boolean = false,
  ): Promise<UserDocument | null> {
    const query = this.userModel.findById(id);
    if (populateRoles) {
      query
        .populate({ path: 'roles', model: 'Role' })
        .populate({ path: 'college', model: 'College' })
        .populate({ path: 'major', model: 'Major' })
        .populate({ path: 'academicClass', model: 'AcademicClass' })
        .populate({ path: 'staffInfo.department', model: 'College' })
        .populate({ path: 'staffInfo.managedClasses', model: 'AcademicClass' });
    }
    const user = await query.select('-password').exec(); // 排除密码字段
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
    return this.userModel
      .findOne({ username })
      .populate({ path: 'roles', model: 'Role' })
      .populate({ path: 'college', model: 'College' })
      .populate({ path: 'major', model: 'Major' })
      .populate({ path: 'academicClass', model: 'AcademicClass' })
      .populate({ path: 'staffInfo.department', model: 'College' })
      .populate({ path: 'staffInfo.managedClasses', model: 'AcademicClass' })
      .exec();
  }

  // --- 更新用户信息 （管理员） ---
  async update(
    id: string | Types.ObjectId,
    updateUserDto: UpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    const userObjectId = transformObjectId(id);
    const userToUpdate = await this.userModel.findById(userObjectId);

    if (!userToUpdate) {
      throw new NotFoundException(`ID 为 '${id}' 的用户不存在。`);
    }

    const {
      collegeId,
      majorId,
      academicClassId,
      staffInfo: staffInfoDto,
      password,
      ...otherData
    } = updateUserDto;
    const updatePayload: Partial<User> = { ...otherData };

    if (password) {
      const saltRounds = 10;
      updatePayload.password = await bcrypt.hash(password, saltRounds);
    }

    // 处理 collegeId 更新
    if (collegeId !== undefined) {
      // 允许设置为 null 来解除关联
      if (collegeId === null) {
        updatePayload.college = undefined; // 或者 null，取决于你的 schema 定义和业务逻辑
        updatePayload.major = undefined; // 如果学院被移除，专业和班级也应被移除
        updatePayload.academicClass = undefined;
      } else {
        const collegeObjectId = transformObjectId(collegeId);
        const collegeDoc = await this.collegeService.findOne(collegeObjectId);
        if (!collegeDoc)
          throw new BadRequestException(`学院 ID '${collegeId}' 不存在。`);
        updatePayload.college = collegeObjectId;
        // 如果学院改变，需要重新验证或清除 major 和 academicClass
        if (
          userToUpdate.college &&
          !userToUpdate.college.equals(collegeObjectId)
        ) {
          updatePayload.major = undefined;
          updatePayload.academicClass = undefined;
        }
      }
    }

    // 处理 majorId 更新 (必须在 collegeId 处理之后)
    if (majorId !== undefined) {
      if (majorId === null) {
        updatePayload.major = undefined;
        updatePayload.academicClass = undefined; // 专业移除，班级也应移除
      } else {
        const currentCollegeId = updatePayload.college || userToUpdate.college;
        if (!currentCollegeId)
          throw new BadRequestException('更新专业前必须先指定学院。');
        const majorObjectId = transformObjectId(majorId);
        const majorDoc = await this.majorService.findOne(majorObjectId);
        if (!majorDoc)
          throw new BadRequestException(`专业 ID '${majorId}' 不存在。`);
        if (
          !majorDoc.college ||
          // @ts-ignore
          !(majorDoc.college._id instanceof Types.ObjectId) ||
          // @ts-ignore
          !majorDoc.college._id.equals(currentCollegeId)
        ) {
          throw new BadRequestException(
            `专业 '${majorDoc.name}' 不属于当前指定的学院。`,
          );
        }
        updatePayload.major = majorObjectId;
        if (userToUpdate.major && !userToUpdate.major.equals(majorObjectId)) {
          updatePayload.academicClass = undefined;
        }
      }
    }

    // 处理 academicClassId 更新 (必须在 majorId 和 collegeId 处理之后)
    if (academicClassId !== undefined && userToUpdate.userType === 'student') {
      if (academicClassId === null) {
        updatePayload.academicClass = undefined;
      } else {
        const currentCollegeId = updatePayload.college || userToUpdate.college;
        const currentMajorId = updatePayload.major || userToUpdate.major;
        if (!currentCollegeId || !currentMajorId)
          throw new BadRequestException('更新班级前必须先指定学院和专业。');

        const academicClassObjectId = transformObjectId(academicClassId);
        const academicClassDoc = await this.academicClassService.findOne(
          academicClassObjectId,
        );
        if (!academicClassDoc)
          throw new BadRequestException(
            `班级 ID '${academicClassId}' 不存在。`,
          );
        if (
          !academicClassDoc.college ||
          // @ts-ignore
          !(academicClassDoc.college._id instanceof Types.ObjectId) ||
          // @ts-ignore
          !academicClassDoc.college._id.equals(
            currentCollegeId as Types.ObjectId,
          )
        ) {
          throw new BadRequestException(
            `班级 '${academicClassDoc.name}' 不属于当前指定的学院。`,
          );
        }
        if (
          !academicClassDoc.major ||
          // @ts-ignore
          !(academicClassDoc.major._id instanceof Types.ObjectId) ||
          // @ts-ignore
          !academicClassDoc.major._id.equals(currentMajorId as Types.ObjectId)
        ) {
          throw new BadRequestException(
            `班级 '${academicClassDoc.name}' 不属于当前指定的专业。`,
          );
        }
        updatePayload.academicClass = academicClassObjectId;
      }
    }

    // 处理 staffInfo 更新
    if (staffInfoDto && userToUpdate.userType === 'staff') {
      const newStaffInfo: Partial<User['staffInfo']> = {};
      if (staffInfoDto.officeLocation !== undefined)
        newStaffInfo.officeLocation =
          staffInfoDto.officeLocation === null
            ? undefined
            : staffInfoDto.officeLocation;
      if (staffInfoDto.title !== undefined)
        newStaffInfo.title =
          staffInfoDto.title === null ? undefined : staffInfoDto.title;

      if (staffInfoDto.departmentId !== undefined) {
        if (staffInfoDto.departmentId === null) {
          newStaffInfo.department = undefined;
        } else {
          const staffDeptObjectId = transformObjectId(
            staffInfoDto.departmentId,
          );
          const staffDeptCollege =
            await this.collegeService.findOne(staffDeptObjectId);
          if (!staffDeptCollege)
            throw new BadRequestException(
              `教职工信息中的部门ID '${staffInfoDto.departmentId}' 不存在。`,
            );
          newStaffInfo.department = staffDeptObjectId;
        }
      }
      if (staffInfoDto.managedClassIds !== undefined) {
        if (
          staffInfoDto.managedClassIds === null ||
          staffInfoDto.managedClassIds.length === 0
        ) {
          newStaffInfo.managedClasses = [];
        } else {
          newStaffInfo.managedClasses = [];
          for (const classId of staffInfoDto.managedClassIds) {
            const managedClassObjectId = transformObjectId(classId);
            const managedClassDoc =
              await this.academicClassService.findOne(managedClassObjectId);
            if (!managedClassDoc)
              throw new BadRequestException(
                `教职工管理的班级ID '${classId}' 不存在。`,
              );
            newStaffInfo.managedClasses.push(managedClassObjectId);
          }
        }
      }
      updatePayload.staffInfo = { ...userToUpdate.staffInfo, ...newStaffInfo };
    }

    this.logger.debug('更新用户信息', updatePayload);

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userObjectId, { $set: updatePayload }, { new: true })
      .select('-password')
      .populate({ path: 'roles', model: 'Role' }) // Populate after update
      .populate({ path: 'college', model: 'College' })
      .populate({ path: 'major', model: 'Major' })
      .populate({ path: 'academicClass', model: 'AcademicClass' })
      .populate({ path: 'staffInfo.department', model: 'College' })
      .populate({ path: 'staffInfo.managedClasses', model: 'AcademicClass' })
      .exec();

    if (!updatedUser) {
      // Should not happen if findById was successful, but as a safeguard
      throw new NotFoundException(`ID 为 '${id}' 的用户在更新后未找到。`);
    }
    return updatedUser.toObject() as Omit<User, 'password'>;
  }

  // --- 更新用户信息 （个人） ---
  async updateProfile(
    userId: string | Types.ObjectId,
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
    userId: string | Types.ObjectId,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const userObjectId = transformObjectId(userId); // 确保 userId 是 ObjectId

    // 1. 验证用户是否存在 (可选，但推荐)
    const userExists = await this.userModel.exists({ _id: userObjectId });
    if (!userExists) {
      throw new NotFoundException(`ID 为 '${userId}' 的用户不存在。`);
    }

    // 2. 哈希新密码
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(
      changePasswordDto.newPassword,
      saltRounds,
    );

    // 3. 直接更新密码字段
    try {
      const updateResult = await this.userModel.updateOne(
        { _id: userObjectId },
        { $set: { password: hashedNewPassword } },
      );

      if (updateResult.matchedCount === 0) {
        // 理论上在 userExists 检查后不应发生，但作为额外的安全措施
        throw new NotFoundException(`ID 为 '${userId}' 的用户不存在。`);
      }
      if (updateResult.modifiedCount === 0) {
        // 可能新密码与旧密码相同，或者更新由于某种原因未生效
        // 根据业务需求，这里可以不抛出错误，或者记录一个警告
        console.warn(
          `Password for user ID '${userId}' was not modified. It might be the same as the old password.`,
        );
      }
    } catch (error) {
      console.error('修改密码时更新数据库失败:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('修改密码失败，请稍后重试。');
    }
  }

  // --- 删除用户 (DELETE) ---
  async remove(id: string | Types.ObjectId): Promise<void> {
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

  // --- 添加角色到用户 ---
  async addRoleToUser(
    userId: string | Types.ObjectId,
    roleIdString: string,
  ): Promise<UserDocument | null> {
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(roleIdString)
    ) {
      throw new BadRequestException('Invalid User ID or Role ID format.');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    const roleId = transformObjectId(roleIdString);

    // Check if the role is already assigned
    const roleAlreadyAssigned = user.roles.some((assignedRoleId) =>
      assignedRoleId.equals(roleId),
    );
    if (roleAlreadyAssigned) {
      // You might want to throw a ConflictException or just return the user
      // For now, let's throw a BadRequestException
      throw new BadRequestException(
        `Role with ID ${roleIdString} is already assigned to user ${userId}.`,
      );
    }

    user.roles.push(roleId);
    await user.save();
    return this.findOneById(userId, true); // Return user with populated roles
  }

  // --- 移除用户的角色信息 ---
  async removeRoleFromUser(
    userId: string | Types.ObjectId,
    roleIdString: string,
  ): Promise<UserDocument | null> {
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(roleIdString)
    ) {
      throw new BadRequestException('Invalid User ID or Role ID format.');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    const roleIdToRemove = new Types.ObjectId(roleIdString);

    const initialRolesCount = user.roles.length;
    user.roles = user.roles.filter(
      (assignedRoleId) => !assignedRoleId.equals(roleIdToRemove),
    );

    if (user.roles.length === initialRolesCount) {
      throw new NotFoundException(
        `Role with ID ${roleIdString} was not assigned to user ${userId}, or already removed.`,
      );
    }

    await user.save();
    return this.findOneById(userId, true); // Return user with populated roles
  }

  // --- 根据用户类型查找所有用户 ---
  async findAllUserIdsByFilter(
    userType?: 'student' | 'staff' | 'all',
  ): Promise<Types.ObjectId[]> {
    const query = this.userModel.find();
    if (userType && userType !== 'all') {
      query.where({ userType: userType });
    }
    const users = await query.select('_id').lean().exec(); // .lean() 返回普通 JS 对象，更快
    return users.map((user) => user._id);
  }

  // --- 根据角色 ID 查找用户 ID ---
  async findUserIdsByRoleIds(
    roleIds: string[],
    userType?: 'student' | 'staff' | 'all',
  ): Promise<Types.ObjectId[]> {
    const objectRoleIds = roleIds.map((id) => new Types.ObjectId(id)); // 确保是 ObjectId
    const query = this.userModel.find({ roles: { $in: objectRoleIds } });
    if (userType && userType !== 'all') {
      query.where({ userType: userType });
    }
    const users = await query.select('_id').lean().exec();
    return users.map((user) => user._id);
  }

  // --- 根据学院 ID 查找用户 ID ---
  async findUserIdsByCollegeIds(
    collegeIds: string[],
    userType?: 'student' | 'staff' | 'all',
  ): Promise<Types.ObjectId[]> {
    const objectCollegeIds = collegeIds.map((id) => new Types.ObjectId(id));
    const query = this.userModel.find({ college: { $in: objectCollegeIds } });
    if (userType && userType !== 'all') {
      query.where({ userType: userType });
    }
    const users = await query.select('_id').lean().exec();
    return users.map((user) => user._id);
  }

  // --- 根据专业 ID 查找用户 ID ---
  async findUserIdsByMajorIds(
    majorIds: string[],
    userType?: 'student' | 'staff' | 'all',
  ): Promise<Types.ObjectId[]> {
    const objectMajorIds = majorIds.map((id) => new Types.ObjectId(id));
    const query = this.userModel.find({ major: { $in: objectMajorIds } });
    if (userType && userType !== 'all') {
      query.where({ userType: userType });
    }
    const users = await query.select('_id').lean().exec();
    return users.map((user) => user._id);
  }

  // --- 根据班级 ID 查找用户 ID ---
  async findUserIdsByAcademicClassIds(
    academicClassIds: string[],
    userType?: 'student' | 'staff' | 'all',
  ): Promise<Types.ObjectId[]> {
    const objectAcademicClassIds = academicClassIds.map(
      (id) => new Types.ObjectId(id),
    );
    const query = this.userModel.find({
      academicClass: { $in: objectAcademicClassIds },
    });
    if (userType && userType !== 'all') {
      query.where({ userType: userType });
    }
    const users = await query.select('_id').lean().exec();
    return users.map((user) => user._id);
  }

  // --- 根据 ID 列表查找用户信息 ---
  async findUsersByIds(userIds: Types.ObjectId[]): Promise<UserDocument[]> {
    return this.userModel.find({ _id: { $in: userIds } }).exec();
  }

  /**
   * 更新用户头像
   * @param userId 用户ID
   * @param avatarUrl 新头像的URL
   */
  async updateAvatar(userId: string, avatarUrl: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('无效的用户ID格式');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`ID为"${userId}"的用户不存在`);
    }

    user.avatar = avatarUrl;
    await user.save();

    this.logger.log(`用户 ${userId} 更新了头像: ${avatarUrl}`);

    return user;
  }
}
