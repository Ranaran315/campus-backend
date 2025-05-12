// ===================================================================================
// !! 重要说明 !!
// ===================================================================================
//
// 1. 如何运行此脚本:
//    此脚本用于向数据库填充核心角色和权限.
//    推荐使用 ts-node 直接运行此脚本，因为它需要导入 TypeScript 文件中定义的 Mongoose Schema.
//    在项目根目录下执行 (确保已安装 ts-node: pnpm add -D ts-node typescript):
//      node -r ts-node/register ./scripts/seed-roles.js
//
// 2. 权限定义来源:
//    此脚本直接从 '../src/role/constants/permissions.constants.ts' 文件中的
//    `VALID_PERMISSIONS` Set 导入所有可用的权限字符串.
//    因此，`permissions.constants.ts` 是权限定义的唯一真实来源.
//    添加新权限时，请先修改该文件.
//
// 3. 数据库连接:
//    脚本会尝试使用环境变量 `MONGODB_URI` 或默认值 `mongodb://localhost:27017/campus` 连接数据库.
//    请确保连接 URI 正确，并将 `campus` 替换为你的实际数据库名.
//
// 4. .env 文件:
//    如果你使用 .env 文件管理环境变量 (例如 MONGODB_URI)，请取消脚本中 `require('dotenv').config()` 行的注释，
//    并确保 `path` 指向正确的 .env 文件位置 (相对于此脚本文件).
//
// ===================================================================================

const mongoose = require('mongoose');
// 如果你使用 .env 文件来管理环境变量，可以取消下面这行的注释 (并确保路径正确)
// require('dotenv').config({ path: '../.env' });

// 直接从 TypeScript 源文件导入权限定义
// ts-node 将在运行时处理此导入
const {
  VALID_PERMISSIONS,
} = require('../src/role/constants/permissions.constants.ts');
if (
  !VALID_PERMISSIONS ||
  !(VALID_PERMISSIONS instanceof Set) ||
  VALID_PERMISSIONS.size === 0
) {
  console.error(
    "错误：未能从 '../src/role/constants/permissions.constants.ts' 正确加载 VALID_PERMISSIONS，或者权限集为空。",
  );
  process.exit(1);
}
const ALL_AVAILABLE_PERMISSIONS = Array.from(VALID_PERMISSIONS);

// 定义核心角色
// 注意：请根据 VALID_PERMISSIONS 中的实际权限字符串更新以下角色的权限列表
const CORE_ROLES = [
  {
    name: 'admin',
    displayName: '超级管理员',
    permissions: ALL_AVAILABLE_PERMISSIONS, // 管理员拥有所有已定义的权限
    isSystemRole: true,
  },
  {
    name: 'student',
    displayName: '学生',
    permissions: [
      'user:view_profile_own',
      'user:edit_profile_own',
      'user:change_password_own',
      'user:search_directory',
      'notification:read_feed_own',
      'notification:read_detail_own',
      'notification:mark_as_read_own',
      'notification:delete_receipt_own',
      'course:view_catalog_all',
      'course_section:view_details_own_enrolled',
      'course_material:download_enrolled',
      'course_assignment:submit_own_enrolled',
      'course_grade:view_own_enrolled',
      'calendar_event:create_own_personal',
      'calendar_event:read_own_personal',
      'calendar_event:update_own_personal',
      'calendar_event:delete_own_personal',
      'academic_calendar:view_official',
      'friend_request:send',
      'friend_request:manage_own',
      'friend:list_own',
      'friend:remove_own',
      'im:send_direct_message',
      'im:view_direct_message_history_own',
      'im_group:create',
      'im_group:join_public',
      'im_group:be_invited_to_private',
      'im_group:leave_own',
      'im_group:send_message_joined',
      'im_group:view_history_joined',
    ],
    isSystemRole: true,
  },
  {
    name: 'staff', // 假设为普通教职工，具体权限需细化，此处为示例
    displayName: '教职工',
    permissions: [
      'user:view_profile_own',
      'user:edit_profile_own',
      'user:change_password_own',
      'user:search_directory',
      'notification:read_feed_own',
      'notification:read_detail_own',
      'notification:mark_as_read_own',
      'notification:delete_receipt_own',
      'notification:create_class', // 假设教职工可以向班级发通知
      'notification:view_publish_history_own',
      'academic_structure:view_departments_list',
      'academic_structure:view_majors_list',
      'academic_structure:view_classes_list',
      'course:view_catalog_all',
      'calendar_event:create_own_personal',
      'calendar_event:read_own_personal',
      'calendar_event:update_own_personal',
      'calendar_event:delete_own_personal',
      'academic_calendar:view_official',
      'friend_request:send',
      'friend_request:manage_own',
      'friend:list_own',
      'friend:remove_own',
      'im:send_direct_message',
      'im:view_direct_message_history_own',
      'im_group:create',
      'im_group:join_public',
      'im_group:be_invited_to_private',
      'im_group:leave_own',
      'im_group:send_message_joined',
      'im_group:view_history_joined',
      // 可能需要添加更多教职工特定权限，例如管理其教授的课程等
      // 'course_section:manage_enrollment_own_teaching',
      // 'course_section:view_details_own_teaching',
      // 'course_material:upload_own_teaching',
      // 'course_assignment:create_own_teaching',
      // 'course_grade:input_own_teaching',
    ],
    isSystemRole: true,
  },
  // 你可以根据需要添加更多角色，例如 'teacher', 'counselor', 'department_admin'
  // 并从 ALL_AVAILABLE_PERMISSIONS 中为他们选择合适的权限子集
];

// 你的 MongoDB 连接 URI
// 优先使用环境变量 MONGODB_URI，否则使用默认值
const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus'; // 确保 'campus' 是你的数据库名

async function seedRoles() {
  try {
    await mongoose.connect(dbURI);
    console.log('成功连接到 MongoDB.');

    // 导入 RoleSchema。
    // 当使用 `node -r ts-node/register ./scripts/seed-roles.js` 运行时，
    // ts-node 会处理 TypeScript 文件的导入。
    const { RoleSchema } = require('../src/role/role.schema'); // ts-node 会解析此 .ts 文件
    const Role = mongoose.model('Role', RoleSchema);

    console.log('开始填充核心角色数据...');
    for (const roleData of CORE_ROLES) {
      // 验证 roleData.permissions 中的所有权限是否都存在于 ALL_AVAILABLE_PERMISSIONS
      if (roleData.permissions && Array.isArray(roleData.permissions)) {
        const invalidPermissions = roleData.permissions.filter(
          (p) => !VALID_PERMISSIONS.has(p),
        );
        if (invalidPermissions.length > 0) {
          console.warn(
            `警告：角色 "${roleData.name}" 定义了无效或未在 VALID_PERMISSIONS 中声明的权限: ${invalidPermissions.join(', ')}. 这些权限将被忽略。`,
          );
          // 可选择过滤掉无效权限，或在此处抛出错误停止脚本
          roleData.permissions = roleData.permissions.filter((p) =>
            VALID_PERMISSIONS.has(p),
          );
        }
      }

      const existingRole = await Role.findOne({ name: roleData.name });
      if (existingRole) {
        console.log(`角色 "${roleData.name}" 已存在。正在检查并更新其属性...`);
        existingRole.displayName = roleData.displayName;
        existingRole.permissions = roleData.permissions; // 使用新的权限列表
        existingRole.isSystemRole = roleData.isSystemRole;
        await existingRole.save();
        console.log(`角色 "${roleData.name}" 的属性已更新。`);
      } else {
        const newRole = new Role(roleData);
        await newRole.save();
        console.log(`角色 "${roleData.name}" 创建成功。`);
      }
    }
    console.log('核心角色数据填充完毕。');
  } catch (error) {
    console.error('填充角色数据时发生错误:', error);
  } finally {
    if (
      mongoose.connection.readyState === 1 ||
      mongoose.connection.readyState === 2
    ) {
      // 1 = connected, 2 = connecting
      await mongoose.disconnect();
      console.log('已从 MongoDB 断开连接。');
    }
  }
}

seedRoles();
