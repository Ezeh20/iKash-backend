import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { UpdateEscrowDto } from './dto/update-escrow.dto';
import { InitializeEscrowDto } from './dto/initialize-escrow.dto';
import { FundEscrowDto } from './dto/fund-escrow.dto';
import { ReleaseEscrowDto } from './dto/release-escrow.dto';
import { SyncEscrowDto, EscrowAction } from './dto/sync-escrow.dto';
import { EscrowRepository } from './escrow.repository';
import { TrustlessWorkService } from './trustless-work.service';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly repo: EscrowRepository,
    private readonly tw: TrustlessWorkService,
    private readonly config: ConfigService,
  ) {}

  // ─── Trustless Work Escrow Flow ────────────────────────────────────────

  /**
   * STEP 1: Initialize escrow
   *
   * Creates a Trustless Work multi-release escrow contract.
   * Returns an unsigned XDR for client-side wallet signing.
   *
   * Security: The backend builds the payload with hardcoded treasury/support
   * addresses so the frontend cannot tamper with escrow roles.
   */
  async initialize(dto: InitializeEscrowDto) {
    // Guard: prevent duplicate escrows per order
    const existing = await this.repo.findByOrder(dto.orderId);
    if (existing && existing.contractId) {
      throw new BadRequestException(
        'An escrow contract already exists for this order',
      );
    }

    const treasuryAddress = this.config.getOrThrow<string>(
      'IKASH_TREASURY_ADDRESS',
    );
    const supportAddress = this.config.getOrThrow<string>(
      'IKASH_SUPPORT_ADDRESS',
    );
    const usdcIssuer = this.config.getOrThrow<string>(
      'TRUSTLESS_WORK_USDC_ISSUER',
    );
    const platformFee = Number(
      this.config.get<string>('IKASH_PLATFORM_FEE', '1'),
    );

    // Build Trustless Work payload — roles are server-controlled for security
    const payload = {
      signer: dto.signerAddress,
      engagementId: dto.orderId,
      title: dto.title,
      description: `iKash P2P escrow for order ${dto.orderId}`,
      roles: {
        approver: treasuryAddress,
        serviceProvider: dto.sellerAddress,
        receiver: dto.buyerAddress,
        releaseSigner: dto.sellerAddress,
        disputeResolver: supportAddress,
      },
      platformFee,
      milestones: [
        {
          description: 'P2P fiat-to-crypto exchange',
          amount: String(dto.amount),
          status: '',
        },
      ],
      trustline: {
        address: usdcIssuer,
        decimals: 7,
      },
    };

    const result = await this.tw.initializeEscrow(payload);

    // Create or update the local DB record
    let escrow = await this.repo.findByOrder(dto.orderId);
    if (!escrow) {
      escrow = await this.repo.create({
        orderId: dto.orderId,
        buyerAddress: dto.buyerAddress,
        sellerAddress: dto.sellerAddress,
        amount: dto.amount,
        escrowStatus: 'pending',
      });
    } else {
      await this.repo.update(escrow.escrowId, {
        buyerAddress: dto.buyerAddress,
        sellerAddress: dto.sellerAddress,
        amount: dto.amount,
      });
    }

    return {
      escrowId: escrow?.escrowId,
      unsignedTransaction: result.unsignedTransaction,
    };
  }

  /**
   * STEP 2: Fund escrow
   *
   * The seller deposits USDC into the escrow contract.
   * Returns an unsigned XDR for client-side wallet signing.
   */
  async fund(dto: FundEscrowDto) {
    const escrow = await this.getOrFail(dto.escrowId);

    if (!escrow.contractId) {
      throw new BadRequestException(
        'Escrow has not been initialized on-chain yet. Complete the initialize step first.',
      );
    }

    if (escrow.escrowStatus !== 'initialized') {
      throw new BadRequestException(
        `Cannot fund escrow in status "${escrow.escrowStatus}". Must be "initialized".`,
      );
    }

    const result = await this.tw.fundEscrow({
      contractId: escrow.contractId,
      signer: dto.signerAddress,
      amount: dto.amount,
    });

    return {
      escrowId: escrow.escrowId,
      unsignedTransaction: result.unsignedTransaction,
    };
  }

  /**
   * STEP 3: Release escrow funds
   *
   * The seller confirms fiat receipt and signs the release.
   * Returns an unsigned XDR for client-side wallet signing.
   */
  async release(dto: ReleaseEscrowDto) {
    const escrow = await this.getOrFail(dto.escrowId);

    if (!escrow.contractId) {
      throw new BadRequestException('Escrow has no on-chain contract');
    }

    if (!['funded', 'fiat_sent'].includes(escrow.escrowStatus)) {
      throw new BadRequestException(
        `Cannot release escrow in status "${escrow.escrowStatus}". Must be "funded" or "fiat_sent".`,
      );
    }

    const result = await this.tw.releaseMilestoneFunds({
      contractId: escrow.contractId,
      releaseSigner: dto.releaseSigner,
      milestoneIndex: '0', // P2P uses single milestone
    });

    return {
      escrowId: escrow.escrowId,
      unsignedTransaction: result.unsignedTransaction,
    };
  }

  /**
   * SYNC: Broadcast signed transaction and update DB
   *
   * The frontend sends the wallet-signed XDR. The backend broadcasts it
   * via Trustless Work and updates the local state accordingly.
   *
   * Security: We validate the escrow status transition before broadcasting.
   */
  async syncTransaction(dto: SyncEscrowDto) {
    const escrow = await this.getOrFail(dto.escrowId);

    // Validate expected state transition
    this.validateStatusTransition(escrow.escrowStatus, dto.action);

    // Broadcast the signed transaction
    const result = await this.tw.sendTransaction(dto.signedXdr);

    if (result.status !== 'SUCCESS') {
      this.logger.error(
        `Transaction failed for escrow ${dto.escrowId}: ${JSON.stringify(result)}`,
      );
      throw new BadRequestException({
        error: 'TransactionFailed',
        message: result.message ?? 'Transaction was not successful on-chain',
        details: result,
      });
    }

    // Update DB based on the action
    const updateData: any = {};

    switch (dto.action) {
      case EscrowAction.INITIALIZE:
        updateData.escrowStatus = 'initialized';
        if (result.contractId) {
          updateData.contractId = result.contractId;
        }
        updateData.txHashLock = dto.signedXdr.substring(0, 64); // Store a reference
        break;

      case EscrowAction.FUND:
        updateData.escrowStatus = 'funded';
        break;

      case EscrowAction.RELEASE:
        updateData.escrowStatus = 'released';
        updateData.txHashRelease = dto.signedXdr.substring(0, 64);
        break;
    }

    await this.repo.update(dto.escrowId, updateData);

    return {
      escrowId: dto.escrowId,
      status: result.status,
      contractId: result.contractId ?? escrow.contractId,
      newEscrowStatus: updateData.escrowStatus,
    };
  }

  /**
   * Get escrow status with optional on-chain balance enrichment
   */
  async getStatus(id: string) {
    const escrow = await this.getOrFail(id);

    const response: any = {
      ...escrow,
      onChainBalance: null,
      onChainData: null,
    };

    // If we have a contractId, fetch live on-chain data
    if (escrow.contractId) {
      try {
        const [balanceRes, onChainRes] = await Promise.allSettled([
          this.tw.getEscrowBalance(escrow.contractId),
          this.tw.getEscrowByContractId(escrow.contractId, true),
        ]);

        if (balanceRes.status === 'fulfilled') {
          response.onChainBalance = balanceRes.value;
        }
        if (onChainRes.status === 'fulfilled') {
          response.onChainData = onChainRes.value;
        }
      } catch (err) {
        this.logger.warn(
          `Could not fetch on-chain data for escrow ${id}: ${err}`,
        );
      }
    }

    return response;
  }

  /**
   * Mark that the buyer has sent fiat payment.
   * This is a local-only status update; no on-chain action needed.
   */
  async markFiatSent(id: string) {
    const escrow = await this.getOrFail(id);

    if (escrow.escrowStatus !== 'funded') {
      throw new BadRequestException(
        `Cannot mark fiat sent for escrow in status "${escrow.escrowStatus}". Must be "funded".`,
      );
    }

    return this.repo.update(id, { escrowStatus: 'fiat_sent' });
  }

  // ─── Legacy CRUD (backward compatibility) ──────────────────────────────

  async create(dto: CreateEscrowDto) {
    const exists = await this.repo.findByOrder(dto.orderId);
    if (exists)
      throw new BadRequestException('Ya existe escrow para ese orderId');
    return this.repo.create(dto);
  }

  list(p: PaginationDto, orderId?: string) {
    if (orderId)
      return this.repo.findMany({
        skip: p.skip,
        take: p.take,
        where: { orderId },
      });
    return this.repo.findMany({ skip: p.skip, take: p.take });
  }

  async get(id: string) {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Escrow no encontrado');
    return item;
  }

  update(id: string, dto: UpdateEscrowDto) {
    return this.repo.update(id, dto);
  }

  remove(id: string) {
    return this.repo.delete(id);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private async getOrFail(id: string) {
    const escrow = await this.repo.findById(id);
    if (!escrow) throw new NotFoundException(`Escrow ${id} not found`);
    return escrow;
  }

  private validateStatusTransition(
    currentStatus: string,
    action: EscrowAction,
  ) {
    const validTransitions: Record<string, string[]> = {
      [EscrowAction.INITIALIZE]: ['pending'],
      [EscrowAction.FUND]: ['initialized'],
      [EscrowAction.RELEASE]: ['funded', 'fiat_sent'],
    };

    const allowed = validTransitions[action];
    if (!allowed || !allowed.includes(currentStatus)) {
      throw new BadRequestException(
        `Invalid state transition: cannot "${action}" from status "${currentStatus}". ` +
          `Expected one of: [${allowed?.join(', ')}]`,
      );
    }
  }
}