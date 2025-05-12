import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module'; // To use UsersService
import { RoleModule } from '../role/role.module'; // To use RoleService
import { AdminController } from './admin.controller';

@Module({
  imports: [
    UsersModule, // Make UsersService available for injection
    RoleModule, // Make RoleService available for injection
  ],
  controllers: [AdminController],
  providers: [], // Admin-specific services could go here if needed later
})
export class AdminModule {}
