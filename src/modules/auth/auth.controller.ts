import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { rateLimitConfig } from '../../config/rate-limit.config';
import { AuthService } from './auth.service';
import { AppException, ErrorCode } from '../../common/errors';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Endpoint for wallet-based login.
   * Emits a temporary JWT based on the public key.
   */
  @Throttle({ default: rateLimitConfig.auth })
  @Post('login')
  login(@Body('publicKey') publicKey: string) {
    if (!publicKey) {
      throw new AppException(
        ErrorCode.MISSING_PUBLIC_KEY,
        'Public key is required',
      );
    }
    return this.authService.login(publicKey);
  }
}
