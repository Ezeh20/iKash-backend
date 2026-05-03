import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly diditApiUrl = process.env.DIDIT_API_URL || 'https://verification.didit.me/v3';
  private readonly diditApiKey = process.env.DIDIT_API_KEY;
  private readonly diditWorkflowId = process.env.DIDIT_WORKFLOW_ID;

  constructor(private prisma: PrismaService) {}

  async initializeSession(userId: string) {
    try {
      if (!this.diditApiKey) {
        throw new Error('DIDIT_API_KEY is not configured');
      }

      if (!this.diditWorkflowId) {
        throw new Error('DIDIT_WORKFLOW_ID is not configured');
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
          callback: 'http://localhost:3001/dashboard',
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`Error from Didit API: ${errorData}`);
        throw new Error('Failed to create Didit session');
      }

      const data = await response.json();
      return { sessionUrl: data.url };
    } catch (error) {
      this.logger.error(`Error initializing KYC session: ${error.message}`);
      throw new InternalServerErrorException('Could not initialize KYC session');
    }
  }

  async processWebhookEvent(payload: any) {
    const { vendor_data, status } = payload;
    const userId = vendor_data;

    if (!userId) {
      this.logger.warn('Webhook received without vendor_data (userId)');
      return;
    }

    // Didit test webhooks send non-UUID mock data like "test-vendor-data-123"
    // Validate UUID to prevent Prisma from crashing.
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(userId)) {
      this.logger.warn(`Skipping database update: vendor_data '${userId}' is not a valid UUID (usually happens with Test Webhooks).`);
      return;
    }

    this.logger.log(`Processing KYC webhook for user: ${userId}, status: ${status}`);

    // We map Didit's string statuses to our internal enum. Didit sometimes sends spaces like "Not Started"
    const statusLower = status?.toLowerCase().trim().replace(/ +/g, '_') || '';
    let kycStatus: any = 'pending';

    if (statusLower === 'approved') {
      kycStatus = 'approved';
    } else if (statusLower === 'declined' || statusLower === 'rejected') {
      kycStatus = 'rejected';
    } else if (statusLower === 'review' || statusLower === 'in_review') {
      kycStatus = 'in_review';
    } else if (statusLower === 'expired') {
      kycStatus = 'expired';
    } else if (statusLower === 'kyc_expired') {
      kycStatus = 'kyc_expired';
    } else if (statusLower === 'abandoned') {
      kycStatus = 'abandoned';
    } else if (statusLower === 'resubmitted') {
      kycStatus = 'resubmitted';
    } else if (statusLower === 'not_started') {
      kycStatus = 'not_started';
    } else if (statusLower === 'in_progress') {
      kycStatus = 'in_progress';
    } else {
      kycStatus = 'pending';
    }

    try {
      await this.prisma.appUser.update({
        where: { userId },
        data: { 
          kycStatus,
          kycUpdatedAt: new Date()
        },
      });
      this.logger.log(`Successfully updated user ${userId} to KYC status: ${kycStatus}`);
    } catch (error) {
      this.logger.error(`Failed to update user kycStatus in database: ${error.message}`);
    }
  }
}
