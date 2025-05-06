import { Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
// import { JwtModule } from '@nestjs/jwt';
// import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    // JwtModule.registerAsync({
    //   imports: [ConfigModule],
    //   inject: [ConfigService],
    //   useFactory: (configService: ConfigService) => ({
    //     secret: configService.get('JWT_SECRET'),
    //     signOptions: { expiresIn: '1d' },
    //   }),
    // }),
  ],
  providers: [NotificationsGateway],
  exports: [NotificationsGateway]
})
export class NotificationsModule {}