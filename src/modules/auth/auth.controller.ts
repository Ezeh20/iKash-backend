import { Controller, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AppException, ErrorCode } from '../../common/errors';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  AuditAction,
  AuditResult,
} from '../audit-log/enums/audit-action.enum';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Endpoint for wallet-based login.
   * Emits a temporary JWT based on the public key.
   */
  @Post('login')
  async login(@Body('publicKey') publicKey: string, @Req() req: Request) {
    const ctx = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    if (!publicKey) {
      await this.auditLogService.create({
        action: AuditAction.USER_LOGIN_FAILURE,
        resourceType: 'User',
        result: AuditResult.FAILURE,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { reason: 'missing_public_key' },
      });
      throw new AppException('Public key is required');
    }

    return this.authService.login(publicKey, ctx);
  }
}