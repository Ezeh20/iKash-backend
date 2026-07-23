import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { AppUser } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AppException, ErrorCode } from '../../common/errors';
import { CreateAuthChallengeDto } from './dto/create-auth-challenge.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthChallengeResponse {
  challenge: string;
  expiresAt: string;
}

const DEFAULT_CHALLENGE_EXPIRATION_SECONDS = 300;

const ED25519_SIGNATURE_LENGTH = 64;

const SEP_53_PREFIX = Buffer.from('Stellar Signed Message:\n', 'utf8');

const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Step 1 of wallet authentication: issues a short-lived, cryptographically
   * random challenge that the client must sign with the wallet's secret key.
   * Any previous active challenge for the same public key is replaced.
   */
  async createChallenge(
    dto: CreateAuthChallengeDto,
  ): Promise<AuthChallengeResponse> {
    const { publicKey } = dto;
    this.assertValidPublicKey(publicKey);

    const challenge = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.getChallengeExpirationSeconds() * 1000,
    );

    await this.prisma.authChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    await this.prisma.authChallenge.upsert({
      where: { publicKey },
      create: { publicKey, challenge, expiresAt },
      update: { challenge, expiresAt, usedAt: null, createdAt: new Date() },
    });

    return { challenge, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Step 2 of wallet authentication: verifies the signed challenge and issues
   * a temporary JWT only if the signature proves ownership of the wallet.
   */
  async login(dto: LoginDto): Promise<{ access_token: string; user: AppUser }> {
    const { publicKey, challenge, signature } = dto;
    this.assertValidPublicKey(publicKey);

    const stored = await this.prisma.authChallenge.findUnique({
      where: { publicKey },
    });

    if (
      !stored ||
      stored.usedAt !== null ||
      stored.expiresAt.getTime() <= Date.now() ||
      stored.challenge !== challenge
    ) {
      throw new AppException(
        ErrorCode.INVALID_CHALLENGE,
        'Challenge is invalid or has expired',
      );
    }

    const signatureBytes = this.decodeSignature(signature);

    let isValidSignature = false;
    try {
      const keypair = Keypair.fromPublicKey(publicKey);
      const challengeBytes = Buffer.from(challenge, 'utf8');
      const sep53Hash = createHash('sha256')
        .update(Buffer.concat([SEP_53_PREFIX, challengeBytes]))
        .digest();

      // Freighter and Stellar CLI sign the SEP-53 hash. Keep raw challenge
      // verification for compatibility with clients that sign bytes directly.
      isValidSignature =
        keypair.verify(sep53Hash, signatureBytes) ||
        keypair.verify(challengeBytes, signatureBytes);
    } catch (error) {
      // Log the reason (never the signature) so an SDK/operational failure
      // is distinguishable from an ordinary bad signature; the client still
      // only ever sees the generic 401.
      this.logger.warn(
        `Signature verification threw: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      isValidSignature = false;
    }

    if (!isValidSignature) {
      throw new AppException(
        ErrorCode.INVALID_SIGNATURE,
        'Signature verification failed',
      );
    }

    const consumed = await this.prisma.authChallenge.updateMany({
      where: {
        publicKey,
        challenge,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    if (consumed.count === 0) {
      throw new AppException(
        ErrorCode.INVALID_CHALLENGE,
        'Challenge is invalid or has expired',
      );
    }

    const user = await this.prisma.appUser.upsert({
      where: { publicKey },
      create: { publicKey },
      update: {},
    });

    const payload: { sub: string; publicKey: string } = {
      sub: user.userId,
      publicKey,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user,
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

  private assertValidPublicKey(publicKey: string): void {
    if (!StrKey.isValidEd25519PublicKey(publicKey)) {
      throw new AppException(
        ErrorCode.INVALID_WALLET,
        'Invalid Stellar public key',
      );
    }
  }

  private decodeSignature(signature: string): Buffer {
    if (!BASE64_REGEX.test(signature)) {
      throw new AppException(
        ErrorCode.INVALID_SIGNATURE,
        'Signature must be valid Base64',
      );
    }
    const decoded = Buffer.from(signature, 'base64');
    if (decoded.length !== ED25519_SIGNATURE_LENGTH) {
      throw new AppException(
        ErrorCode.INVALID_SIGNATURE,
        'Signature verification failed',
      );
    }
    return decoded;
  }

  private getChallengeExpirationSeconds(): number {
    const raw = this.config.get<string>('AUTH_CHALLENGE_EXPIRATION_SECONDS');
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_CHALLENGE_EXPIRATION_SECONDS;
    }
    return Math.floor(parsed);
  }
}
