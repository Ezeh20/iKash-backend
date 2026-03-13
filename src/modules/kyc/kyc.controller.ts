import { Controller, Post, Body, Headers, UnauthorizedException, HttpCode, HttpStatus, InternalServerErrorException, Req, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { KycService } from './kyc.service';
import * as crypto from 'crypto';

@Controller('kyc')
export class KycController {
  private readonly webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;

  constructor(private readonly kycService: KycService) {}

  @Post('start')
  // NOTE: This endpoint should ideally be protected by auth guard, getting user id from request payload or token.
  // Assuming the client simply sends userId in body for this implementation plan.
  async startKyc(@Body('userId') userId: string) {
    if (!userId) {
      throw new UnauthorizedException('User ID is required');
    }
    return this.kycService.initializeSession(userId);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-signature-v2') signatureV2: string,
    @Headers('x-signature') signatureV1: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: any,
  ) {
    if (!this.webhookSecret) {
      throw new InternalServerErrorException('DIDIT_WEBHOOK_SECRET is not configured');
    }

    const sigToVerify = signatureV2 || signatureV1;
    if (!sigToVerify) {
      throw new UnauthorizedException('Missing X-Signature header');
    }

    const rawBodyBuffer = req.rawBody;
    if (!rawBodyBuffer) {
      throw new InternalServerErrorException('Missing raw HTTP body. Ensure { rawBody: true } is set in main.ts');
    }

    // Testing shows Didit's X-Signature-V2 currently matches pure raw body HMAC, not timestamp prepended.
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBodyBuffer)
      .digest('hex');

    if (sigToVerify !== expectedSignature) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Process webhook asynchronously / queue it
    // Using setTimeout to process in background and return 200 immediately
    setTimeout(() => {
      this.kycService.processWebhookEvent(payload);
    }, 0);

    return { received: true };
  }
}
