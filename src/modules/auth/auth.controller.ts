import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { rateLimitConfig } from '../../config/rate-limit.config';
import { AuthService } from './auth.service';
import { ChallengeDto } from './dto/challenge.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Endpoint to request a secure challenge for wallet authentication.
   */
  @Post('challenge')
  async getChallenge(@Body() body: ChallengeDto) {
    return this.authService.generateChallenge(body.publicKey);
  }

  /**
   * Endpoint for secure wallet-based login using challenge-response flow.
   */
  @Throttle({ default: rateLimitConfig.auth })
  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.authService.verifyLogin(body.publicKey, body.challenge, body.signature);
  }
}
