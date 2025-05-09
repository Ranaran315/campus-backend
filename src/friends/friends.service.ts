import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { User, UserDocument } from 'src/users/user.schema';
import {
  FriendRequest,
  FriendRequestDocument,
  FriendRequestStatus,
} from './friendRequest.schema';
import {
  FriendCategory,
  FriendCategoryDocument,
  FriendRelation,
  FriendRelationDocument,
} from './friends.schema';
import * as pinyin from 'pinyin'; // 用于处理中文拼音首字母
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { UsersService } from 'src/users/users.service';
import { Logger } from '@nestjs/common';

interface UserInfo {
  _id: Types.ObjectId | string;
  username: string;
  nickname?: string;
  avatar?: string;
}

type PopulatedFriendInRelation = Pick<
  User,
  'username' | 'nickname' | 'avatar'
> & { _id: Types.ObjectId };

// Helper type for the lean FriendRelation document with a populated friend
// This represents the structure of elements in 'relations', 'friendsInCategory', 'uncategorizedFriends'
interface LeanPopulatedFriendRelation {
  _id: Types.ObjectId;
  user: Types.ObjectId; // Assuming 'user' in FriendRelation is ObjectId after lean
  friend: PopulatedFriendInRelation;
  remark: string;
  status: string;
  categoryId: Types.ObjectId | null; // This is the ObjectId from the DB or null
  createdAt?: Date;
  updatedAt?: Date;
  // Include other fields from FriendRelation schema if necessary
  // For example, if you added 'isFavorite', include it here:
  // isFavorite?: boolean;
}

// The type for elements of the 'result' array in getFriendsByCategory
export interface CategorizedFriendsGroup {
  categoryId: string | null; // string for actual categories, null for default/uncategorized
  categoryName: string;
  friends: LeanPopulatedFriendRelation[];
}

const INITIAL_DEFAULT_CATEGORY_NAME = '好友'; // 默认分类名称

// friends.service.ts
@Injectable()
export class FriendsService {
  constructor(
    @InjectModel(FriendRelation.name)
    private friendRelationModel: Model<FriendRelationDocument>,
    @InjectModel(FriendRequest.name)
    private friendRequestModel: Model<FriendRequestDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(FriendCategory.name) // 新增 FriendCategoryModel 注入
    private friendCategoryModel: Model<FriendCategoryDocument>, // 新增
    private notificationsGateway: NotificationsGateway,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService, // 注入UsersService
  ) {}

  private readonly logger = new Logger('FriendsService'); // 添加日志记录器

  // 获取用户的好友列表（分类）
  async getFriends(userId: string): Promise<any[]> {
    const friendsRelations = await this.friendRelationModel
      .find({ user: userId, status: 'accepted' })
      .populate(
        'friend',
        'username nickname avatar onlineStatus lastOnlineTime',
      )
      .populate({ path: 'categoryId', select: 'name _id' }) // 填充分类信息
      .lean();

    // 在应用层面进行排序：按分类名，然后按好友备注或昵称
    friendsRelations.sort((a, b) => {
      const categoryA = a.categoryId as
        | (FriendCategory & { _id: Types.ObjectId; isDefault?: boolean })
        | null;
      const categoryB = b.categoryId as
        | (FriendCategory & { _id: Types.ObjectId; isDefault?: boolean })
        | null;

      // 排序逻辑：默认分类优先，然后按分类名称，然后按好友显示名称
      if (
        categoryA &&
        categoryA.isDefault &&
        !(categoryB && categoryB.isDefault)
      )
        return -1;
      if (
        !(categoryA && categoryA.isDefault) &&
        categoryB &&
        categoryB.isDefault
      )
        return 1;

      const categoryNameA = categoryA ? categoryA.name : ''; // 好友应该总是有分类
      const categoryNameB = categoryB ? categoryB.name : '';

      if (categoryNameA.localeCompare(categoryNameB) !== 0) {
        return categoryNameA.localeCompare(categoryNameB);
      }

      const friendA = a.friend as any;
      const friendB = b.friend as any;
      const displayNameA =
        a.remark || friendA?.nickname || friendA?.username || '';
      const displayNameB =
        b.remark || friendB?.nickname || friendB?.username || '';
      return displayNameA.localeCompare(displayNameB);
    });

    return friendsRelations;
  }

  // 获取用户的好友列表（按字母排序）
  async getFriendsAlphabetically(userId: string): Promise<any> {
    // 1. 获取用户的所有好友关系
    const relations = await this.friendRelationModel
      .find({ user: userId, status: 'accepted' })
      .populate('friend', 'username nickname avatar') // 填充好友信息
      .lean();

    // 2. 为每个好友准备排序用的名称（优先使用备注名）
    const friendsWithSortName = relations.map((relation) => {
      const friend = relation.friend as any; // 已通过populate填充
      const displayName = relation.remark || friend.nickname || friend.username;

      // 获取用于排序的首字母（可以使用第三方库如 pinyin 处理中文）
      const sortLetter = this.getFirstLetter(displayName);

      return {
        ...relation,
        friend,
        displayName,
        sortLetter,
      };
    });

    // 3. 按首字母排序
    friendsWithSortName.sort((a, b) =>
      a.sortLetter.localeCompare(b.sortLetter),
    );

    // 4. 按首字母分组
    const groupedFriends = {};
    for (const item of friendsWithSortName) {
      const letter = item.sortLetter.toUpperCase();
      if (!groupedFriends[letter]) {
        groupedFriends[letter] = [];
      }
      groupedFriends[letter].push(item);
    }

    // 5. 转换为前端所需格式
    const result = Object.keys(groupedFriends)
      .sort()
      .map((letter) => ({
        letter,
        friends: groupedFriends[letter],
      }));

    return result;
  }

  // 获取字符串的首字母（简单版，实际应考虑中文拼音）
  private getFirstLetter(str: string): string {
    if (!str || str.length === 0) return '#';

    // 对中文字符获取拼音首字母
    const pinyinResult = pinyin(str.charAt(0), {
      style: pinyin.STYLE_FIRST_LETTER,
    });

    const first = str.charAt(0).toUpperCase();
    // 字母返回自身，非字母返回#
    return /[A-Z]/.test(first) ? first : '#';
  }

  // 发送好友请求
  async sendFriendRequest(
    senderId: string,
    receiverId: string,
    message?: string,
  ): Promise<any> {
    // 检查发送者与接收者是否相同
    if (senderId === receiverId) {
      throw new BadRequestException('不能添加自己为好友。');
    }

    // 检查用户是否存在
    const receiver = await this.userModel.findById(receiverId);
    if (!receiver) {
      throw new NotFoundException('接收者用户不存在');
    }

    // 检查是否已经是好友
    const existingRelation = await this.friendRelationModel.findOne({
      user: senderId,
      friend: receiverId,
      status: 'accepted',
    });

    if (existingRelation) {
      throw new ConflictException('该用户已经是您的好友');
    }

    // 检查是否有未处理的请求
    const existingRequest = await this.friendRequestModel.findOne({
      sender: senderId,
      receiver: receiverId,
      status: 'pending',
    });

    if (existingRequest) {
      throw new ConflictException('已有发送给此用户的待处理请求');
    }

    // 创建新的好友请求
    const friendRequest = new this.friendRequestModel({
      sender: senderId,
      receiver: receiverId,
      message,
      status: 'pending',
    });

    // 保存请求
    const newRequest = await friendRequest.save();

    // 获取发送者信息并发送实时通知
    try {
      const senderInfo = (await this.usersService.findOne(
        senderId,
      )) as unknown as UserInfo;

      if (senderInfo) {
        // 准备通知数据
        const notificationData = {
          requestId: (newRequest._id as ObjectId).toString(),
          sender: {
            _id: senderInfo._id.toString(),
            username: senderInfo.username,
            nickname: senderInfo.nickname || senderInfo.username,
            avatar: senderInfo.avatar || '',
          },
          message: message || '',
          createdAt: new Date(),
          status: newRequest.status,
        };

        // 发送WebSocket通知
        this.notificationsGateway.sendFriendRequestNotification(
          receiverId,
          notificationData,
        );
      }
    } catch (error) {
      console.error('发送好友请求通知失败:', error);
      // 通知失败不应影响请求的创建
    }

    return newRequest;
  }

  // 获取收到的好友请求 (可以考虑添加 status 参数进行筛选)
  async getReceivedFriendRequests(
    userId: string,
    status?: FriendRequestStatus | FriendRequestStatus[],
  ): Promise<any[]> {
    const query: any = {
      receiver: userId,
      receiverDeleted: false, // --- 新增：只获取接收者未删除的 ---
    };
    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }
    // ... (rest of the method)
    const requests = await this.friendRequestModel
      .find(query)
      .populate('sender', 'username nickname avatar')
      .sort({ createdAt: -1 })
      .lean();
    return requests;
  }

  // 获取发送的好友请求 (可以考虑添加 status 参数进行筛选)
  async getSentFriendRequests(
    userId: string,
    status?: FriendRequestStatus | FriendRequestStatus[],
  ): Promise<any[]> {
    const query: any = {
      sender: userId,
      senderDeleted: false, // --- 新增：只获取发送者未删除的 ---
    };
    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }
    // ... (rest of the method)
    const requests = await this.friendRequestModel
      .find(query)
      .populate('receiver', 'username nickname avatar')
      .sort({ createdAt: -1 })
      .lean();
    return requests;
  }

  // 处理好友请求
  async handleFriendRequest(
    userId: string,
    requestId: string,
    action: string,
  ): Promise<any> {
    const request = await this.friendRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('好友请求不存在');
    }

    // 确保只有接收者可以处理请求
    if (request.receiver.toString() !== userId) {
      throw new ForbiddenException('没有权限处理此请求');
    }

    // 确保只能处理 pending 状态的请求，防止重复处理或处理已完成的请求
    if (request.status !== 'pending') {
      throw new BadRequestException(
        `该请求已被处理，当前状态: ${request.status}`,
      );
    }

    // --- 关键检查点 ---
    const newStatus = action as FriendRequestStatus; // 'accepted' or 'rejected'
    if (newStatus !== 'accepted' && newStatus !== 'rejected') {
      // 增加校验
      this.logger.error(`无效的 action 值: ${action}，无法更新 status`);
      throw new BadRequestException(`无效的操作: ${action}`);
    }
    request.status = newStatus;
    this.logger.log(`准备保存请求 ${requestId}，新状态: ${request.status}`); // 添加日志
    // --- 检查点结束 ---

    await request.save(); // 保存更新
    this.logger.log(
      `请求 ${requestId} 已保存，数据库中状态应为: ${request.status}`,
    ); // 确认保存

    // 如果接受请求，创建双向好友关系
    if (action === 'accepted') {
      const senderId = request.sender.toString();
      const receiverId = userId;

      // 获取接收者 (userId) 的默认分类
      const receiverDefaultCategory = await this.friendCategoryModel.findOne({
        user: receiverId,
        isDefault: true,
      });
      if (!receiverDefaultCategory) {
        this.logger.error(
          `用户 ${receiverId} 的默认分类未找到，无法添加好友到分类。`,
        );
        // 可以考虑创建一个，或者抛出更具体的错误
        throw new InternalServerErrorException(
          `用户 ${receiverId} 的默认分类不存在。`,
        );
      }

      // 获取发送者 (senderId) 的默认分类
      const senderDefaultCategory = await this.friendCategoryModel.findOne({
        user: senderId,
        isDefault: true,
      });
      if (!senderDefaultCategory) {
        this.logger.error(
          `用户 ${senderId} 的默认分类未找到，无法添加好友到分类。`,
        );
        throw new InternalServerErrorException(
          `用户 ${senderId} 的默认分类不存在。`,
        );
      }

      // 创建正向关系 (user -> friend)
      await this.friendRelationModel.findOneAndUpdate(
        { user: userId, friend: request.sender },
        {
          $set: { status: 'accepted', categoryId: receiverDefaultCategory._id },
        },
        { upsert: true, new: true },
      );

      // 创建反向关系 (friend -> user)
      await this.friendRelationModel.findOneAndUpdate(
        { user: request.sender, friend: userId },
        { $set: { status: 'accepted', categoryId: senderDefaultCategory._id } },
        { upsert: true, new: true },
      );
    }

    // 发送请求状态更新通知
    try {
      const senderId = request.sender.toString();
      const receiverInfo = (await this.usersService.findOne(
        userId,
      )) as unknown as UserInfo; // 处理请求的人
      if (receiverInfo) {
        this.notificationsGateway.sendFriendRequestUpdateNotification(
          senderId,
          {
            requestId: (request._id as ObjectId).toString(),
            status: (action as 'accepted') || 'rejected', // 'accepted' or 'rejected'
            // 可以选择性地包含处理者信息
            // handler: { _id: receiverInfo._id, nickname: receiverInfo.nickname || receiverInfo.username }
          },
        );
      }
    } catch (error) {
      console.error('发送好友请求状态更新通知失败:', error);
    }

    return { success: true, action, updatedStatus: request.status };
  }

  // 删除非待处理的好友请求记录
  async deleteFriendRequestRecord(
    userId: string, // ID of the user requesting the deletion
    requestId: string,
  ): Promise<{ success: boolean; message: string }> {
    const request = await this.friendRequestModel.findById(requestId);

    if (!request) {
      throw new NotFoundException('好友请求记录不存在');
    }

    const isSender = request.sender.toString() === userId;
    const isReceiver = request.receiver.toString() === userId;

    if (!isSender && !isReceiver) {
      throw new ForbiddenException('你没有权限操作此好友请求记录');
    }

    // 仍然只允许操作非 pending 状态的请求记录（根据你之前的逻辑）
    // 如果要允许隐藏 pending 请求，需要调整此处的逻辑
    if (request.status === FriendRequestStatus.PENDING) {
      throw new BadRequestException(
        '不能删除待处理的好友请求记录，请先处理或撤销。',
      );
    }

    let updated = false;
    if (isSender && !request.senderDeleted) {
      request.senderDeleted = true;
      updated = true;
      this.logger.log(`用户 ${userId} (发送者) 标记删除好友请求 ${requestId}`);
    } else if (isReceiver && !request.receiverDeleted) {
      request.receiverDeleted = true;
      updated = true;
      this.logger.log(`用户 ${userId} (接收者) 标记删除好友请求 ${requestId}`);
    }

    if (updated) {
      await request.save();
    }

    // 如果双方都已删除，则从数据库中物理删除
    if (request.senderDeleted && request.receiverDeleted) {
      await this.friendRequestModel.findByIdAndDelete(requestId);
      this.logger.log(`好友请求 ${requestId} 已被双方删除，已从数据库中移除。`);
      return { success: true, message: '好友请求记录已从数据库彻底删除' };
    }

    return { success: true, message: '好友请求记录已从您的视图中移除' };
  }

  // 设置好友备注
  async setFriendRemark(
    userId: string,
    friendId: string,
    remark: string,
  ): Promise<any> {
    const relation = await this.friendRelationModel.findOne({
      user: userId,
      friend: friendId,
      status: 'accepted',
    });

    if (!relation) {
      throw new NotFoundException('好友关系不存在');
    }

    relation.remark = remark;
    return await relation.save();
  }

  // 删除好友
  async removeFriend(userId: string, friendId: string): Promise<any> {
    // 删除双向好友关系
    await this.friendRelationModel.deleteOne({
      user: userId,
      friend: friendId,
    });
    await this.friendRelationModel.deleteOne({
      user: friendId,
      friend: userId,
    });

    return { success: true };
  }

  // 创建默认分类
  async createDefaultCategoryForUser(
    userId: string | Types.ObjectId,
  ): Promise<FriendCategoryDocument> {
    let defaultCategory = await this.friendCategoryModel.findOne({
      user: userId,
      isDefault: true,
    });
    if (defaultCategory) {
      this.logger.log(`Default category already exists for user ${userId}.`);
      return defaultCategory;
    }

    const existingNamedCategory = await this.friendCategoryModel.findOne({
      user: userId,
      name: INITIAL_DEFAULT_CATEGORY_NAME,
    });
    if (existingNamedCategory && !existingNamedCategory.isDefault) {
      this.logger.warn(
        `User ${userId} has a category named "${INITIAL_DEFAULT_CATEGORY_NAME}" but it's not marked as default. Creating a new default.`,
      );
    }

    defaultCategory = new this.friendCategoryModel({
      name: INITIAL_DEFAULT_CATEGORY_NAME,
      user: userId,
      isDefault: true,
    });
    await defaultCategory.save();
    this.logger.log(
      `Default category "${INITIAL_DEFAULT_CATEGORY_NAME}" created for user ${userId}.`,
    );
    return defaultCategory;
  }

  // 创建新的好友分类
  async createFriendCategory(
    userId: string,
    categoryName: string,
  ): Promise<FriendCategoryDocument> {
    // 1. 检查分类名是否已存在 (对于该用户)
    const existingCategory = await this.friendCategoryModel.findOne({
      name: categoryName,
      user: userId,
    });
    if (existingCategory) {
      throw new ConflictException(`分类 "${categoryName}" 已存在`);
    }

    // 2. 创建新分类
    const newCategory = new this.friendCategoryModel({
      name: categoryName.trim(), // 去除名称前后的空格
      user: userId,
    });

    // 3. 保存新分类
    return await newCategory.save();
  }

  // 获取用户好友的所有分类
  async getFriendCategories(userId: string): Promise<FriendCategoryDocument[]> {
    return this.friendCategoryModel
      .find({ user: userId })
      .sort({ createdAt: 1 })
      .lean();
  }

  // 按分类获取好友（返回的数据格式利于前端按照分类进行手风琴风格的展示）
  async getFriendsByCategory(
    userId: string,
  ): Promise<CategorizedFriendsGroup[]> {
    // 1. 获取用户的所有分类
    // Assuming FriendCategory lean objects are (FriendCategory & { _id: Types.ObjectId })
    const categories = await this.friendCategoryModel
      .find({ user: userId })
      .sort({ name: 1 })
      .lean();
    this.logger.debug(
      `User [${userId}] - Fetched categories: ${JSON.stringify(categories.map((c) => ({ id: c._id, name: c.name })))}`,
    ); // 添加日志

    // 2. 获取所有已接受的好友关系，并填充好友信息
    const relations = (await this.friendRelationModel
      .find({ user: userId, status: 'accepted' })
      .populate('friend', 'username nickname avatar')
      .lean()) as unknown as LeanPopulatedFriendRelation[]; // Explicitly cast to unknown before asserting

    const result: CategorizedFriendsGroup[] = [];

    // 3. 为每个分类添加好友
    this.logger.debug(
      `User [${userId}] - Processing ${categories.length} categories.`,
    );
    for (const category of categories) {
      const friendsInCategory = relations.filter(
        (relation) =>
          relation.categoryId &&
          relation.categoryId.toString() === category._id.toString(),
      );
      result.push({
        categoryId: category._id.toString(), // category._id is Types.ObjectId
        categoryName: category.name,
        friends: friendsInCategory,
      });
      this.logger.debug(
        `User [${userId}] - Added category to result: ${category.name}, Friends count: ${friendsInCategory.length}`,
      ); // 添加日志
    }

    // 4. 处理可能仍然存在的 categoryId 为 null 的好友 (作为一种兼容或错误恢复)
    // 理想情况下，在迁移和新逻辑下，不应有 categoryId 为 null 的好友
    const friendsWithNullCategory = relations.filter(
      (relation) => !relation.categoryId,
    );

    if (friendsWithNullCategory.length > 0) {
      this.logger.warn(
        `User [${userId}] - Found ${friendsWithNullCategory.length} friends with null categoryId. Moving them to default category display.`,
      );
      const defaultCategory = categories.find((c) => c.isDefault);
      if (defaultCategory) {
        const defaultGroup = result.find(
          (g) => g.categoryId === defaultCategory._id.toString(),
        );
        if (defaultGroup) {
          defaultGroup.friends.push(...friendsWithNullCategory);
          this.logger.debug(
            `Added ${friendsWithNullCategory.length} null-category friends to existing default group "${defaultGroup.categoryName}"`,
          );
        } else {
          // This case should ideally not happen if defaultCategory is always in `categories` and processed
          result.push({
            categoryId: defaultCategory._id.toString(),
            categoryName: defaultCategory.name,
            friends: friendsWithNullCategory,
          });
          this.logger.warn(
            `Created a new display group for default category "${defaultCategory.name}" for null-category friends because it wasn't in the primary loop result.`,
          );
        }
      } else {
        // 如果连默认分类都找不到（严重错误），则创建一个临时的“未分类”组
        this.logger.error(
          `User [${userId}] - Default category not found. Orphaned friends with null categoryId will be in "未分类".`,
        );
        result.push({
          categoryId: null, // 表示这些是真正未被归类的
          categoryName: '未分类 (异常)',
          friends: friendsWithNullCategory,
        });
      }
    }

    // 排序：默认分类优先，其他按名称
    result.sort((a, b) => {
      const catA = categories.find((c) => c._id.toString() === a.categoryId);
      const catB = categories.find((c) => c._id.toString() === b.categoryId);

      if (catA && catA.isDefault && !(catB && catB.isDefault)) return -1;
      if (!(catA && catA.isDefault) && catB && catB.isDefault) return 1;
      return a.categoryName.localeCompare(b.categoryName);
    });

    this.logger.debug(
      `User [${userId}] - Final result before return: ${JSON.stringify(result.map((r) => ({ name: r.categoryName, count: r.friends.length })))}`,
    );
    return result;
  }

  // 修改好友分类名称
  async updateFriendCategoryName(
    userId: string,
    categoryId: string,
    newName: string,
  ): Promise<FriendCategoryDocument> {
    const category = await this.friendCategoryModel.findOne({
      _id: categoryId,
      user: userId,
    });

    if (!category) {
      throw new NotFoundException('分类不存在或不属于您');
    }

    // 检查新名称是否与该用户的其他分类名称冲突 (可选，但推荐)
    const trimmedNewName = newName.trim();
    if (trimmedNewName === category.name) {
      return category; // 名称未改变，直接返回
    }
    if (!trimmedNewName) {
      throw new BadRequestException('分类名称不能为空');
    }

    const existingCategoryWithNewName = await this.friendCategoryModel.findOne({
      name: trimmedNewName,
      user: userId,
      _id: { $ne: categoryId }, // 排除当前正在编辑的分类
    });

    if (existingCategoryWithNewName) {
      throw new ConflictException(`分类 "${trimmedNewName}" 已存在`);
    }

    category.name = trimmedNewName;
    return await category.save();
  }

  // 删除好友分类
  async deleteFriendCategory(
    userId: string,
    categoryId: string,
  ): Promise<{ success: boolean; message: string }> {
    // 1. 验证分类是否存在且属于该用户
    const category = await this.friendCategoryModel.findOne({
      _id: categoryId,
      user: userId,
    });

    if (!category) {
      throw new NotFoundException('要删除的分类不存在或不属于您');
    }

    if (category.isDefault) {
      throw new BadRequestException('默认好友分类不能被删除。');
    }

    // 2. 找到用户的默认分类
    // 注意：friendRelationModel 中的 user 字段是发起关系的用户，categoryId 属于这个关系
    const defaultCategory = await this.friendCategoryModel.findOne({
      user: userId,
      isDefault: true,
    });
    if (!defaultCategory) {
      // 理论上不应该发生，因为每个用户都应该有一个默认分类
      this.logger.error(`用户 ${userId} 的默认分类未找到，无法转移好友。`);
      throw new InternalServerErrorException(
        '无法找到用户的默认分类以转移好友。',
      );
    }

    // 将此分类下的所有好友的 categoryId 更新为默认分类的 ID
    const updateResult = await this.friendRelationModel.updateMany(
      { user: userId, categoryId: new Types.ObjectId(categoryId) },
      { $set: { categoryId: defaultCategory._id } },
    );

    this.logger.log(
      `User [${userId}] - Category [${categoryId}]: Moved ${updateResult.modifiedCount} friends to default category.`,
    );

    // 3. 删除该分类
    await this.friendCategoryModel.deleteOne({ _id: categoryId, user: userId });

    this.logger.log(
      `User [${userId}] - Category [${categoryId}] deleted successfully.`,
    );

    return {
      success: true,
      message: `分类 "${category.name}" 已删除，其下的好友已移至默认分类。`,
    };
  }

  // 修改好友所属分类
  async updateFriendCategory(
    userId: string,
    friendId: string,
    newCategoryId: string | null, // 接收 categoryId，可以为 null 表示移至未分类
  ): Promise<FriendRelationDocument> {
    const relation = await this.friendRelationModel.findOne({
      user: userId,
      friend: friendId,
      status: 'accepted',
    });

    if (!relation) {
      throw new NotFoundException('好友关系不存在');
    }

    let targetCategoryId: Types.ObjectId;

    if (newCategoryId) {
      // 校验 categoryId 是否有效且属于该用户
      const categoryExists = await this.friendCategoryModel.findOne({
        _id: newCategoryId,
        user: userId,
      });
      if (!categoryExists) {
        throw new BadRequestException('指定的分类不存在或不属于您');
      }
      targetCategoryId = new Types.ObjectId(newCategoryId);
    } else {
      // 如果 newCategoryId 为 null，则将好友移至用户的默认分类
      const defaultCategory = await this.friendCategoryModel.findOne({
        user: userId,
        isDefault: true,
      });
      if (!defaultCategory) {
        this.logger.error(`用户 ${userId} 的默认分类未找到，无法移动好友。`);
        throw new InternalServerErrorException('无法找到用户的默认分类。');
      }
      targetCategoryId = defaultCategory._id as Types.ObjectId;
    }

    relation.categoryId = targetCategoryId;
    return await relation.save();
  }

  // 获取单个好友关系的详细信息
  async getFriendRelationDetails(
    userId: string, // 当前登录用户的 ID
    relationId: string, // 好友关系文档的 _id
  ): Promise<FriendRelationDocument | null> {
    // 返回 FriendRelationDocument 类型
    const relation = await this.friendRelationModel
      .findOne({
        _id: relationId,
        user: userId, // 确保这条好友关系属于当前用户
      })
      .populate<{ friend: UserDocument }>({
        // 明确 populate 的类型
        path: 'friend',
        select: '-password', // 选择需要返回的用户公开字段
      })
      .populate<{ categoryId: FriendCategoryDocument | null }>({
        // 新增：填充 categoryId
        path: 'categoryId',
        select: 'name _id isDefault',
      })
      .lean(); // 使用 lean() 以获得普通 JS 对象，如果不需要 Mongoose 文档方法

    if (!relation) {
      throw new NotFoundException('好友关系不存在或不属于您');
    }

    return relation as FriendRelationDocument; // 断言为 FriendRelationDocument
  }
}
