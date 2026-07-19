import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Generates a temporary JWT for a user based on their wallet public key.
   * This is used during the initial account setup flow.
   */
  login(publicKey: string): { access_token: string } {
    const payload: { sub: string; publicKey: string } = {
      sub: publicKey,
      publicKey,
    };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  /**
   * Generates a definitive JWT after the user has completed their profile setup.
   */
  finalizeSetup(userId: string, publicKey: string): { access_token: string } {
    const payload: { sub: string; publicKey: string; setupComplete: boolean } =
      {
        sub: userId,
        publicKey,
        setupComplete: true,
      };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
