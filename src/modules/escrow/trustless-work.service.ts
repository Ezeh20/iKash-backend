import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * TrustlessWorkService
 *
 * HTTP client wrapper for the Trustless Work REST API.
 * Handles all communication with the escrow protocol.
 *
 * SECURITY: This service NEVER handles private keys.
 * It builds unsigned transactions and broadcasts already-signed ones.
 */
@Injectable()
export class TrustlessWorkService {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(TrustlessWorkService.name);

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.getOrThrow<string>('TRUSTLESS_WORK_API_URL');
    const apiKey = this.config.getOrThrow<string>('TRUSTLESS_WORK_API_KEY');

    this.http = axios.create({
      baseURL,
      timeout: 60_000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  // ─── Deploy ────────────────────────────────────────────────────────────

  /**
   * Initialize a multi-release escrow contract.
   * Returns an unsigned XDR transaction that must be signed client-side.
   */
  async initializeEscrow(payload: {
    signer: string;
    engagementId: string;
    title: string;
    description: string;
    roles: Record<string, string>;
    platformFee: number;
    milestones: Array<{
      description: string;
      amount: string;
      status: string;
    }>;
    trustline: { address: string; decimals: number };
  }): Promise<{ unsignedTransaction: string }> {
    return this.post('/deployer/multi-release', {
      ...payload,
      roles: payload.roles,
      milestones: payload.milestones,
      trustline: payload.trustline,
    });
  }

  // ─── Fund ──────────────────────────────────────────────────────────────

  /**
   * Fund an existing escrow contract with USDC.
   * Returns an unsigned XDR transaction.
   */
  async fundEscrow(payload: {
    contractId: string;
    signer: string;
    amount: number;
  }): Promise<{ unsignedTransaction: string }> {
    return this.post('/escrow/multi-release/fund-escrow', payload);
  }

  // ─── Milestone ─────────────────────────────────────────────────────────

  /**
   * Change milestone status (service provider marks as complete).
   * Returns an unsigned XDR transaction.
   */
  async changeMilestoneStatus(payload: {
    contractId: string;
    milestoneIndex: string;
    newEvidence: string;
    newStatus: string;
    serviceProvider: string;
  }): Promise<{ unsignedTransaction: string }> {
    return this.post(
      '/escrow/multi-release/change-milestone-status',
      payload,
    );
  }

  /**
   * Release funds for a completed milestone.
   * Returns an unsigned XDR transaction.
   */
  async releaseMilestoneFunds(payload: {
    contractId: string;
    releaseSigner: string;
    milestoneIndex: string;
  }): Promise<{ unsignedTransaction: string }> {
    return this.post(
      '/escrow/multi-release/release-milestone-funds',
      payload,
    );
  }

  // ─── Broadcast ─────────────────────────────────────────────────────────

  /**
   * Send a signed XDR transaction to the Stellar network.
   * This is the ONLY method that actually executes on-chain.
   */
  async sendTransaction(
    signedXdr: string,
  ): Promise<{
    status: string;
    message?: string;
    contractId?: string;
    escrow?: any;
  }> {
    return this.post('/helper/send-transaction', { signedXdr });
  }

  // ─── Query ─────────────────────────────────────────────────────────────

  /**
   * Get escrow data from the on-chain indexer by contract ID.
   * Optionally validates against the blockchain for integrity.
   */
  async getEscrowByContractId(
    contractId: string,
    validateOnChain = false,
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append('contractIds[]', contractId);
    params.append('validateOnChain', String(validateOnChain));

    return this.get(`/helper/get-escrow-by-contract-ids?${params.toString()}`);
  }

  /**
   * Get the on-chain balance of an escrow contract.
   */
  async getEscrowBalance(contractAddress: string): Promise<any> {
    return this.get('/helper/get-multiple-escrow-balance', {
      params: { addresses: [contractAddress] },
    });
  }

  // ─── HTTP helpers ──────────────────────────────────────────────────────

  private async post<T>(url: string, data: unknown): Promise<T> {
    try {
      const res = await this.http.post<T>(url, data);
      return res.data;
    } catch (err) {
      this.handleError(err, `POST ${url}`);
    }
  }

  private async get<T>(url: string, config?: any): Promise<T> {
    try {
      const res = await this.http.get<T>(url, config);
      return res.data;
    } catch (err) {
      this.handleError(err, `GET ${url}`);
    }
  }

  private handleError(err: unknown, context: string): never {
    if (err instanceof AxiosError) {
      const status = err.response?.status ?? HttpStatus.BAD_GATEWAY;
      const message =
        err.response?.data?.message ??
        err.response?.data?.error ??
        err.message;

      this.logger.error(
        `Trustless Work API error [${context}]: ${status} — ${JSON.stringify(message)}`,
      );

      throw new HttpException(
        {
          error: 'TrustlessWorkError',
          message: `Escrow operation failed: ${message}`,
          details: err.response?.data,
        },
        status,
      );
    }

    this.logger.error(`Unexpected error [${context}]:`, err);
    throw new HttpException(
      'Unexpected error communicating with Trustless Work',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
