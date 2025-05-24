import { Request } from 'express';
import { Types } from 'mongoose';
import { User } from 'src/users/schemas/user.schema';

export interface AuthenticatedUser extends Omit<User, 'roles'> {
  _id: Types.ObjectId;
  id: string;
  roles: string[]; // 来自 JWT payload
  permissions: string[]; // 来自 JWT payload
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
