import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction, AuditResult } from '../audit-log/enums/audit-action.enum';

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Generates a temporary JWT for a user based on their wallet public key.
   * This is used during the initial account setup flow. Records a
   * USER_LOGIN_SUCCESS audit event on issuance.
   */
  async login(
    publicKey: string,
    ctx: RequestContext = {},
  ): Promise<{ access_token: string }> {
    const payload: { sub: string; publicKey: string } = {
      sub: publicKey,
      publicKey,
    };
    const token = this.jwtService.sign(payload);

    await this.auditLogService.create({
      action: AuditAction.USER_LOGIN_SUCCESS,
      resourceType: 'User',
      resourceId: publicKey,
      result: AuditResult.SUCCESS,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
    });

    return {
      access_token: token,
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
      };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
