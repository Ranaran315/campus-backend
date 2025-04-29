// filepath: d:\大学资料\论文毕设\毕设\campus-backend\src\auth\guards\jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {} // 'jwt' 对应 JwtStrategy 的名称
