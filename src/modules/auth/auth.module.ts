import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { getJwtSecret } from '../../config/jwt.config';

@Module({
  imports: [
    PassportModule,
    AuditLogModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '1h' },
    }),
  ],
  providers: [AuthService, JwtStrategy, AuthRateLimitGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
