import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AppException, ErrorCode } from '../../common/errors';
import { kyc_status } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction, AuditResult } from '../audit-log/enums/audit-action.enum';

interface DiditWebhookPayload {
  vendor_data?: string;
  status?: string;
  verification_session?: { vendor_data?: string; status?: string };
  session?: { vendor_data?: string; status?: string };
  data?: { vendor_data?: string; status?: string };
}

interface DiditSessionResponse {
  url: string;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly diditApiUrl =
    process.env.DIDIT_API_URL || 'https://verification.didit.me/v3';
  private readonly diditApiKey = process.env.DIDIT_API_KEY;
  private readonly diditWorkflowId = process.env.DIDIT_WORKFLOW_ID;

  constructor(
    private prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async initializeSession(userId: string): Promise<{ sessionUrl: string }> {
    try {
      if (!this.diditApiKey) {
        throw new AppException(
          ErrorCode.KYC_SESSION_FAILED,
          'DIDIT_API_KEY is not configured',
        );
      }

      if (!this.diditWorkflowId) {
        throw new AppException(
          ErrorCode.KYC_SESSION_FAILED,
          'DIDIT_WORKFLOW_ID is not configured',
        );
      }

      this.logger.log(`Initializing KYC session for user: ${userId}`);

      const response = await fetch(`${this.diditApiUrl}/session/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.diditApiKey,
        },
        body: JSON.stringify({
          vendor_data: userId,
          workflow_id: this.diditWorkflowId,
          callback:
            process.env.KYC_CALLBACK_URL || 'http://localhost:3001/dashboard',
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`Error from Didit API: ${errorData}`);
        throw new AppException(
          ErrorCode.KYC_SESSION_FAILED,
          'Failed to create KYC session with the verification provider.',
        );
      }

      const data: DiditSessionResponse =
        (await response.json()) as DiditSessionResponse;
      return { sessionUrl: data.url };
    } catch (error) {
      // Re-throw AppExceptions directly; wrap anything else
      if (error instanceof AppException) throw error;

      const err = error as Error;
      this.logger.error(`Error initializing KYC session: ${err.message}`);
      throw new AppException(
        ErrorCode.KYC_SESSION_FAILED,
        'Could not initialize KYC session.',
      );
    }
  }

  async processWebhookEvent(payload: DiditWebhookPayload): Promise<void> {
    this.logger.log(`[KYC WEBHOOK] Full payload: ${JSON.stringify(payload)}`);

    const userId: string | undefined =
      payload.vendor_data ??
      payload.verification_session?.vendor_data ??
      payload.session?.vendor_data ??
      payload.data?.vendor_data;

    const rawStatus: string | undefined =
      payload.status ??
      payload.verification_session?.status ??
      payload.session?.status ??
      payload.data?.status;

    this.logger.log(
      `[KYC WEBHOOK] Extracted userId=${userId}, rawStatus=${rawStatus}`,
    );

    if (!userId) {
      this.logger.warn(
        `[KYC WEBHOOK] No vendor_data found in payload keys: ${Object.keys(payload || {}).join(', ')}`,
      );
      return;
    }

    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(userId)) {
      this.logger.warn(
        `[KYC WEBHOOK] Skipping: vendor_data '${userId}' is not a valid UUID`,
      );
      return;
    }

    const statusLower: string =
      rawStatus?.toLowerCase().trim().replace(/ +/g, '_') || '';
    this.logger.log(`[KYC WEBHOOK] Normalized status: '${statusLower}'`);

    let kycStatus: kyc_status = 'pending';
    if (statusLower === 'approved') kycStatus = 'approved';
    else if (statusLower === 'declined' || statusLower === 'rejected')
      kycStatus = 'rejected';
    else if (statusLower === 'review' || statusLower === 'in_review')
      kycStatus = 'in_review';
    else if (statusLower === 'expired') kycStatus = 'expired';
    else if (statusLower === 'kyc_expired') kycStatus = 'kyc_expired';
    else if (statusLower === 'abandoned') kycStatus = 'abandoned';
    else if (statusLower === 'resubmitted') kycStatus = 'resubmitted';
    else if (statusLower === 'not_started') kycStatus = 'not_started';
    else if (statusLower === 'in_progress') kycStatus = 'in_progress';
    else kycStatus = 'pending';

    // Capture the pre-update status so the audit record shows the actual
    // transition (previousStatus -> newStatus), not just the new value.
    const existing = await this.prisma.appUser.findUnique({
      where: { userId },
      select: { kycStatus: true },
    });
    const previousStatus = existing?.kycStatus ?? null;

    try {
      const updatedUser = await this.prisma.appUser.update({
        where: { userId },
        data: { kycStatus, kycUpdatedAt: new Date() },
      });
      this.logger.log(
        `[KYC WEBHOOK] âœ… Updated user ${userId} â†’ kycStatus: ${updatedUser.kycStatus}`,
      );

      await this.auditLogService.createOrThrow({
        userId,
        action: AuditAction.KYC_STATUS_UPDATED,
        resourceType: 'User',
        resourceId: userId,
        result: AuditResult.SUCCESS,
        metadata: { previousStatus, newStatus: updatedUser.kycStatus },
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[KYC WEBHOOK] âŒ Failed to update user ${userId}: ${err.message}`,
      );

      await this.auditLogService.createOrThrow({
        userId,
        action: AuditAction.KYC_STATUS_UPDATED,
        resourceType: 'User',
        resourceId: userId,
        result: AuditResult.FAILURE,
        metadata: { previousStatus, attemptedStatus: kycStatus },
      });
    }
  }
}
