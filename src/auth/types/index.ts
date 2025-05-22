import { Request } from 'express';
import { UserDocument } from '../../users/schemas/user.schema'; // Adjust path as needed

export interface AuthenticatedUser {
  id: string; // Or Types.ObjectId, depending on your JWT payload
  username: string;
  roles: string[];
  // Add any other user properties you include in the JWT payload and need in requests
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
