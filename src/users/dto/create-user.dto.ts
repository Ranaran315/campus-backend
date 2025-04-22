// 创建用户数据传输对象
export class CreateUserDto {
  username: string;
  name: string;
  email: string;
  password?: string; // 密码在 service 中哈希
  roles?: string[];
  userType: string;
  studentId?: string;
  staffId?: string;
  staffInfo?: any; // 根据需要定义更具体的类型
  classInfo?: any;
}
