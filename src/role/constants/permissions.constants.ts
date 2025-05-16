export const VALID_PERMISSIONS: ReadonlySet<string> = new Set([
  // --- 用户管理 (User Management) ---
  'user:create', // (管理员) 创建新用户账户
  'user:list_all', // (管理员) 列出所有用户
  'user:view_profile_own', // (所有用户) 查看自己的个人资料
  'user:edit_profile_own', // (所有用户) 编辑自己的个人资料
  'user:change_password_own', // (所有用户) 修改自己的密码
  'user:view_profile_any', // (管理员/特定角色) 查看任意用户的个人资料
  'user:edit_account_any', // (管理员) 编辑任意用户账户信息 (除密码外，如角色、状态)
  'user:reset_password_any', // (管理员) 重置任意用户的密码
  'user:delete_account_any', // (管理员) 删除任意用户账户
  'user:assign_roles_to_any', // (管理员) 为任意用户分配角色
  'user:search_directory', // (所有用户) 搜索用户通讯录/目录
  // 作用域查看权限 (Scoped Views)
  'user:view_course_participants', // (课程教师) 查看所授课程的选课学生列表

  // --- 角色与权限管理 (Role & Permission Management) ---
  'role:create', // (超级管理员) 创建新角色
  'role:read_list', // (超级管理员) 查看角色列表
  'role:read_detail', // (超级管理员) 查看角色详情（包括其权限）
  'role:update', // (超级管理员) 编辑角色（名称、描述、分配的权限）
  'role:delete', // (超级管理员) 删除角色 (系统内置角色可能不允许删除)
  'permission:list_all_available', // (超级管理员) 列出系统中所有可供分配的权限点

  // --- 通知管理 (Notification Management) ---
  'notification:create_global', // (特定管理员) 发布全校范围的通知
  'notification:create_departmental', // (院系管理员/特定角色) 发布指定学院的通知
  'notification:create_major', // (院系管理员/特定角色) 发布指定专业的通知
  'notification:create_class', // (辅导员/班长) 发布指定班级的通知
  'notification:create_course', // (课程教师) 发布指定课程的通知
  'notification:create_to_roles', // (特定管理员) 发布给特定角色的通知
  'notification:create_to_specific_users', // (特定管理员) 发布给特定用户的通知
  'notification:read_feed_own', // (所有用户) 查看自己的通知列表
  'notification:read_detail_own', // (所有用户) 查看自己收到的通知详情
  'notification:mark_as_read_own', // (所有用户) 将自己的通知标记为已读/未读
  'notification:delete_receipt_own', // (所有用户) 从自己的通知列表中“移除”某条通知（删除接收记录）
  'notification:manage_any_published', // (超级管理员/内容管理员) 管理（编辑/删除）系统中任何已发布的通知
  'notification:view_publish_history_own', // (发布者) 查看自己发布通知的历史记录
  'notification:view_publish_history_all', // (管理员) 查看所有通知的发布历史
  'notification:approve_pending', // (特定审批角色) 审批待发布的通知 (如果需要审批流程)
  'notification:manage_templates', // (管理员) 管理通知模板 (如果系统支持)

  // --- 学院管理 (College Management) ---
  'college:create',
  'college:read_list', // 可用于管理员后台
  'college:read_detail', // 可用于管理员后台
  'college:update',
  'college:delete',
  'college:assign_head',
  'college:view_list', // 通用查看列表权限
  'college:view_detail', // 通用查看详情权限 (公开信息)
  'college:view_members', // (可选) 查看学院下的师生，替代 user:view_department_members

  // --- 专业管理 (Major Management) ---
  'major:create', // 通常需要指定所属学院
  'major:read_list_all', // 管理员后台查看所有
  'major:read_list_by_college', // 按学院筛选查看
  'major:read_detail',
  'major:update',
  'major:delete',
  'major:assign_head',
  'major:view_list', // 通用查看列表权限
  'major:view_detail', // 通用查看详情权限 (公开信息)

  // --- 班级管理 (Academic Class Management) ---
  'academic_class:create', // 通常需要指定所属专业
  'academic_class:read_list_all', // 管理员后台查看所有
  'academic_class:read_list_by_major', // 按专业筛选查看
  'academic_class:read_list_by_college', // 按学院筛选查看
  'academic_class:read_detail',
  'academic_class:update',
  'academic_class:delete',
  'academic_class:assign_counselor',
  'academic_class:manage_students', // 管理员或辅导员管理班级学生
  'academic_class:view_list', // 通用查看列表权限
  'academic_class:view_detail_own_member', // 学生/教师查看自己班级信息
  'academic_class:view_students_own_managed', // (辅导员) 查看自己管理班级的学生 (与 user:view_managed_class_students 类似)

  // --- 课程管理 (Course Management) ---
  'course:create_definition', // (教务管理员/院系管理员) 创建新的课程定义（课程库中的课程）
  'course:edit_any_definition', // (教务管理员/院系管理员) 编辑任意课程定义
  'course:delete_any_definition', // (教务管理员/院系管理员) 删除课程定义
  'course:view_catalog_all', // (所有用户) 查看可选课程目录
  // 教学班/课程实例 (Course Section - 特定学期、特定老师的课程)
  'course_section:create', // (教务管理员/院系管理员) 开设教学班
  'course_section:edit_any', // (教务管理员/院系管理员) 编辑任意教学班信息（时间、地点、教师等）
  'course_section:assign_teacher_any', // (教务管理员/院系管理员) 为教学班分配教师
  'course_section:manage_enrollment_any', // (教务管理员) 管理任意教学班的学生选课名单
  'course_section:manage_enrollment_own_teaching', // (课程教师) 管理自己所授教学班的学生选课名单
  'course_section:view_details_own_teaching', // (课程教师) 查看自己所授教学班的详情
  'course_section:view_details_own_enrolled', // (学生) 查看自己已选教学班的详情
  'course_material:upload_own_teaching', // (课程教师) 上传课程资料到自己的教学班
  'course_material:download_enrolled', // (学生) 下载已选课程的资料
  // (如果涉及作业/成绩)
  'course_assignment:create_own_teaching', // (课程教师) 在自己的教学班创建作业
  'course_assignment:submit_own_enrolled', // (学生) 提交已选课程的作业
  'course_grade:input_own_teaching', // (课程教师) 为自己的教学班录入成绩
  'course_grade:view_own_enrolled', // (学生) 查看自己的课程成绩
  'course_grade:manage_any', // (教务管理员) 管理所有课程成绩

  // --- 日程管理 (Calendar Management) ---
  'calendar_event:create_own_personal', // (所有用户) 创建个人日程事件
  'calendar_event:read_own_personal', // (所有用户) 查看个人日程
  'calendar_event:update_own_personal', // (所有用户) 编辑个人日程
  'calendar_event:delete_own_personal', // (所有用户) 删除个人日程
  'academic_calendar:view_official', // (所有用户) 查看学校官方校历
  'academic_calendar:manage_official', // (教务管理员/特定管理员) 管理学校官方校历

  // --- 好友/联系人管理 (Friend/Contact Management) ---
  'friend_request:send', // (所有用户) 发送好友请求
  'friend_request:manage_own', // (所有用户) 处理自己收到的好友请求 (同意/拒绝)
  'friend:list_own', // (所有用户) 查看自己的好友列表
  'friend:remove_own', // (所有用户) 删除自己的好友

  // --- 即时通讯 (IM/Chat Management - 基础) ---
  'im:send_direct_message', // (所有用户) 发送私聊消息
  'im:view_direct_message_history_own', // (所有用户) 查看自己的私聊记录
  'im_group:create', // (所有用户或特定角色) 创建群聊
  'im_group:join_public', // (所有用户) 加入公开群聊
  'im_group:be_invited_to_private', // (所有用户) 能被邀请加入私有群聊
  'im_group:leave_own', // (所有用户) 退出自己加入的群聊
  'im_group:send_message_joined', // (所有用户) 在已加入的群聊中发送消息
  'im_group:view_history_joined', // (所有用户) 查看已加入群聊的历史记录
  'im_group:manage_members_own', // (群主/群管理员) 管理自己群的成员 (踢人、邀请)
  'im_group:edit_details_own', // (群主/群管理员) 编辑自己群的信息
  'im_group:moderate_any', // (系统管理员/IM管理员) 管理任意群组 (解散、禁言等)

  // --- 通知权限 ---
  'inform:create', // 基础创建权限，具体能否创建何种目标范围的通知由后续权限点或业务逻辑控制
  'inform:create_global', // 发布全校范围的通知
  'inform:create_departmental', // 发布指定学院的通知 (可能需要结合用户是否为该学院管理员)
  'inform:create_major', // 发布指定专业的通知
  'inform:create_class', // 发布指定班级的通知
  'inform:create_for_sender_context', // 允许使用 SENDER_OWN_CLASS, SENDER_MANAGED_CLASSES 等一键派发
  'inform:create_to_roles', // 发布给特定角色的通知
  'inform:create_to_specific_users', // 发布给特定用户的通知

  'inform:read_feed_own', // 查看自己的通知列表
  'inform:read_detail_own', // 查看自己收到的通知详情
  'inform:mark_as_read_own', // 将自己的通知标记为已读/未读
  'inform:delete_receipt_own', // 从自己的通知列表中“移除”某条通知

  'inform:manage_any_published', // (管理员) 管理（编辑/删除/归档）系统中任何已发布的通知
  'inform:view_publish_history_own', // (发布者) 查看自己发布通知的历史记录
  'inform:view_publish_history_all', // (管理员) 查看所有通知的发布历史
  'inform:approve_pending', // (特定审批角色) 审批待发布的通知
  'inform:manage_templates', // (管理员) 管理通知模板

  'inform_comment:create_own', // 在自己接收到的通知下发表评论/提问
  'inform_comment:read_own_notification', // 查看自己接收到的通知下的评论
  'inform_comment:manage_any', // (管理员) 管理任何通知下的评论 (删除)

  // --- 系统与后台管理 (System & Admin Panel) ---
  'admin_panel:access', // (各类管理员) 访问后台管理界面
  'system_settings:view', // (超级管理员/特定管理员) 查看系统设置
  'system_settings:edit', // (超级管理员) 修改系统设置
  'audit_log:view', // (超级管理员) 查看系统操作审计日志
]);
