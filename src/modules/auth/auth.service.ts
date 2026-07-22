import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { Keypair } from '@stellar/stellar-sdk';
import * as crypto from 'crypto';
import { AppException, ErrorCode } from '../../common/errors';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generates a unique challenge for wallet authentication
   * Expires in 5 minutes
   */
  async generateChallenge(publicKey: string): Promise<{ challenge: string; expiresAt: Date }> {
    // Validate stellar public key
    try {
      Keypair.fromPublicKey(publicKey);
    } catch {
      throw new AppException(ErrorCode.MISSING_PUBLIC_KEY, 'Invalid Stellar public key');
    }

    const challenge = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.prisma.authChallenge.create({
      data: {
        publicKey,
        challenge,
        expiresAt,
      },
    });

    return { challenge, expiresAt };
  }

  /**
   * Verifies the signature of the challenge
   */
  async verifyLogin(publicKey: string, challenge: string, signature: string): Promise<{ access_token: string; user: import('@prisma/client').AppUser }> {
    const authChallenge = await this.prisma.authChallenge.findUnique({
      where: { challenge },
    });

    if (!authChallenge) {
      throw new AppException(ErrorCode.UNAUTHORIZED_ACTION, 'Challenge not found');
    }

    if (authChallenge.used) {
      throw new AppException(ErrorCode.UNAUTHORIZED_ACTION, 'Challenge already used');
    }

    if (new Date() > authChallenge.expiresAt) {
      throw new AppException(ErrorCode.UNAUTHORIZED_ACTION, 'Challenge expired');
    }

    if (authChallenge.publicKey !== publicKey) {
      throw new AppException(ErrorCode.UNAUTHORIZED_ACTION, 'Public key mismatch');
    }

    let isValid = false;
    try {
      const kp = Keypair.fromPublicKey(publicKey);
      isValid = kp.verify(Buffer.from(challenge), Buffer.from(signature, 'base64'));
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new AppException(ErrorCode.UNAUTHORIZED_ACTION, 'Invalid signature');
    }

    // Mark challenge as used
    await this.prisma.authChallenge.update({
      where: { id: authChallenge.id },
      data: { used: true },
    });

    // Find or create user
    let user = await this.prisma.appUser.findUnique({
      where: { publicKey },
    });

    if (!user) {
      user = await this.prisma.appUser.create({
        data: {
          publicKey,
          pendingAccountInfo: true,
        },
      });
    }

    // Generate JWT
    const payload: { sub: string; publicKey: string } = {
      sub: user.userId, // use userId as sub
      publicKey,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

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
