import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Endpoint for wallet-based login.
   * Emits a temporary JWT based on the public key.
   */
  @Post('login')
  async login(@Body('publicKey') publicKey: string) {
    if (!publicKey) {
      throw new BadRequestException('Public key is required');
    }
    return this.authService.login(publicKey);
  }
}
