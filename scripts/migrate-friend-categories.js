// 该脚本用于迁移好友分类数据
// 1. 为每个用户确保存在一个默认好友分类
// 2. 将 categoryId 为 null 的好友关系迁移到用户的默认分类

const mongoose = require('mongoose');
const { Types } = mongoose;

// --- 配置数据库连接 ---
// 替换为您的 MongoDB 连接字符串
const MONGO_URI = 'mongodb://127.0.0.1:27017/campus';

// --- Mongoose Schema 定义 (简化版，仅包含必要字段) ---
const UserSchema = new mongoose.Schema({
  username: String,
  // ... 其他用户字段
});
const UserModel = mongoose.model('User', UserSchema);

const FriendCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    user: { type: Types.ObjectId, ref: 'User', required: true },
    isDefault: { type: Boolean, default: false, required: true },
  },
  { timestamps: true },
);
FriendCategorySchema.index({ user: 1, name: 1 }, { unique: true });
const FriendCategoryModel = mongoose.model(
  'FriendCategory',
  FriendCategorySchema,
);

const FriendRelationSchema = new mongoose.Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true },
    friend: { type: Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: Types.ObjectId, ref: 'FriendCategory', default: null },
    status: String,
    // ... 其他好友关系字段
  },
  { timestamps: true },
);
const FriendRelationModel = mongoose.model(
  'FriendRelation',
  FriendRelationSchema,
);

const INITIAL_DEFAULT_CATEGORY_NAME = '好友'; // 与您服务中使用的常量保持一致

async function runMigration() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected for migration.');

    // --- 步骤 1: 为每个用户确保/创建默认分类 ---
    console.log(
      '\n--- Step 1: Ensuring/Creating default categories for users ---',
    );
    const users = await UserModel.find({});
    console.log(`Found ${users.length} users.`);

    for (const user of users) {
      let defaultCategory = await FriendCategoryModel.findOne({
        user: user._id,
        isDefault: true,
      });
      if (!defaultCategory) {
        // 检查是否已存在同名但非默认的分类
        const existingNamedCategory = await FriendCategoryModel.findOne({
          user: user._id,
          name: INITIAL_DEFAULT_CATEGORY_NAME,
          isDefault: false,
        });

        if (existingNamedCategory) {
          console.log(
            `User ${user.username} (${user._id}) has a category named "${INITIAL_DEFAULT_CATEGORY_NAME}" but it's not default. Updating it to be default.`,
          );
          existingNamedCategory.isDefault = true;
          await existingNamedCategory.save();
          defaultCategory = existingNamedCategory;
        } else {
          console.log(
            `User ${user.username} (${user._id}) does not have a default category. Creating one...`,
          );
          try {
            defaultCategory = new FriendCategoryModel({
              name: INITIAL_DEFAULT_CATEGORY_NAME,
              user: user._id,
              isDefault: true,
            });
            await defaultCategory.save();
            console.log(
              `Default category "${INITIAL_DEFAULT_CATEGORY_NAME}" created for user ${user.username} (${user._id}).`,
            );
          } catch (e) {
            if (e.code === 11000) {
              // unique index violation
              console.warn(
                `Could not create default category for user ${user.username} (${user._id}) due to unique constraint (user + name). Attempting to find and mark existing as default.`,
              );
              const fallbackCategory = await FriendCategoryModel.findOne({
                user: user._id,
                name: INITIAL_DEFAULT_CATEGORY_NAME,
              });
              if (fallbackCategory && !fallbackCategory.isDefault) {
                fallbackCategory.isDefault = true;
                await fallbackCategory.save();
                console.log(
                  `Marked existing category "${INITIAL_DEFAULT_CATEGORY_NAME}" as default for user ${user.username} (${user._id}).`,
                );
              } else if (fallbackCategory && fallbackCategory.isDefault) {
                console.log(
                  `User ${user.username} (${user._id}) already had "${INITIAL_DEFAULT_CATEGORY_NAME}" as default (found via fallback).`,
                );
              } else {
                console.error(
                  `Failed to create or find default category for user ${user.username} (${user._id}) after unique constraint error.`,
                );
              }
            } else {
              console.error(
                `Error creating default category for user ${user.username} (${user._id}):`,
                e.message,
              );
            }
          }
        }
      } else {
        console.log(
          `User ${user.username} (${user._id}) already has a default category: "${defaultCategory.name}".`,
        );
      }
    }
    console.log('--- Step 1 Finished ---');

    // --- 步骤 2: 迁移 categoryId 为 null 的好友关系 ---
    console.log(
      '\n--- Step 2: Migrating friend relations with null categoryId ---',
    );
    const relationsToMigrate = await FriendRelationModel.find({
      categoryId: null,
      status: 'accepted',
    });
    console.log(
      `Found ${relationsToMigrate.length} accepted friend relations with null categoryId.`,
    );

    let migratedCount = 0;
    for (const relation of relationsToMigrate) {
      const userDefaultCategory = await FriendCategoryModel.findOne({
        user: relation.user,
        isDefault: true,
      });
      if (userDefaultCategory) {
        relation.categoryId = userDefaultCategory._id;
        await relation.save();
        migratedCount++;
        console.log(
          `Migrated relation ${relation._id} (User: ${relation.user}) to category ${userDefaultCategory.name} (${userDefaultCategory._id}).`,
        );
      } else {
        console.warn(
          `Could not find default category for user ${relation.user} (relation ${relation._id}). Skipping migration for this relation.`,
        );
      }
    }
    console.log(`Successfully migrated ${migratedCount} friend relations.`);
    console.log('--- Step 2 Finished ---');

    console.log('\nMigration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

runMigration();
