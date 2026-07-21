import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generates a temporary JWT for a user based on their wallet public key.
   * This is used during the initial account setup flow.
   */
  async login(publicKey: string): Promise<{ access_token: string }> {
    const user = await this.prisma.appUser.findUnique({
      where: { publicKey },
      select: { userId: true, pendingAccountInfo: true },
    });

    if (user) {
      const payload: {
        sub: string;
        publicKey: string;
        setupComplete: boolean;
      } = {
        sub: user.userId,
        publicKey,
        setupComplete: !user.pendingAccountInfo,
      };
      return { access_token: this.jwtService.sign(payload) };
    }

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
