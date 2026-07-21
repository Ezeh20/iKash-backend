import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AppException, ErrorCode } from '../../common/errors';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Endpoint for wallet-based login.
   * Emits a user-scoped JWT for existing accounts, or a temporary wallet JWT
   * for first-time users who have not yet created an account.
   */
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
