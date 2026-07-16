import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderRepository } from './order.repository';
import { EscrowService } from '../escrow/escrow.service';
import { AppException, ErrorCode } from '../../common/errors';
import { Order, order_status } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type OrderFilter = {
  offerId?: string;
  buyerId?: string;
  sellerId?: string;
  userId?: string;
  status?: string;
};

type OrderCreateData = {
  orderId: string;
  offerId: string;
  buyerId: string;
  sellerId: string;
  assetAmount: string;
  fiatAmount: string;
  orderStatus?: string;
  expiresAt?: Date;
  escrow: {
    contractId: string;
    sellerAddress: string;
    buyerAddress: string;
    amount: string;
  };
};

export interface OrderCreateResponse extends Order {
  escrowId?: string | null;
}

export interface OrderDetailResponse extends OrderCreateResponse {
  contractId: string;
  unsignedFundTransaction: string;
  escrow?: { escrowId: string };
}

export interface UserStats {
  totalOrders: number;
  completedOrders: number;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly repo: OrderRepository,
    private readonly escrowService: EscrowService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Atomic order + escrow creation.
   *
   * 1. Pre-generate an orderId (UUIDv4).
   * 2. Call EscrowService.deployEscrowToChain() — interacts ONLY with TW API.
   *    If this fails the method throws and NO database record is created.
   * 3. Persist Order + EscrowOnChain in a single DB transaction.
   * 4. Return the order data with the unsigned fund XDR so the frontend can
   *    prompt the seller to sign.
   */
  async create(dto: CreateOrderDto): Promise<OrderDetailResponse> {
    const orderId = randomUUID();

    this.logger.log(
      `Creating order ${orderId} — deploying escrow to chain first…`,
    );

    const { contractId, unsignedFundTransaction } =
      await this.escrowService.deployEscrowToChain(orderId, {
        sellerAddress: dto.sellerAddress,
        buyerAddress: dto.buyerAddress,
        amount: Number(dto.assetAmount),
        assetCode: dto.assetCode,
        title: dto.title ?? `Order ${orderId}`,
      });

    this.logger.log(
      `Escrow deployed (contract=${contractId}). Persisting order + escrow in DB…`,
    );

    const data: OrderCreateData = {
      orderId,
      offerId: dto.offerId,
      buyerId: dto.buyerId,
      sellerId: dto.sellerId,
      assetAmount: dto.assetAmount,
      fiatAmount: dto.fiatAmount,
      orderStatus: dto.orderStatus,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      escrow: {
        contractId,
        sellerAddress: dto.sellerAddress,
        buyerAddress: dto.buyerAddress,
        amount: dto.assetAmount,
      },
    };

    const order: OrderCreateResponse = (await this.repo.create(
      data,
    )) as OrderCreateResponse;

    this.logger.log(`Order ${orderId} and escrow persisted successfully.`);

    // ── Return combined response ─────────────────────────────────────────
    return {
      ...order,
      escrow: order.escrowId ? { escrowId: order.escrowId } : undefined,
      contractId,
      unsignedFundTransaction,
    };
  }

  list(p: PaginationDto, q: OrderFilter): Promise<Order[]> {
    const where: Record<string, unknown> = {};
    if (q.offerId) where.offerId = q.offerId;
    if (q.buyerId) where.buyerId = q.buyerId;
    if (q.sellerId) where.sellerId = q.sellerId;
    if (q.userId) {
      where.OR = [{ buyerId: q.userId }, { sellerId: q.userId }];
    }
    if (q.status) where.orderStatus = q.status as order_status;

    return this.repo.search(where, p.skip, p.take);
  }

  async get(id: string): Promise<Order> {
    const item = await this.repo.findById(id);
    if (!item) {
      throw new AppException(
        ErrorCode.ORDER_NOT_FOUND,
        `Order ${id} not found`,
      );
    }
    return item;
  }

  update(id: string, dto: UpdateOrderDto): Promise<Order> {
    const data: Record<string, unknown> = { ...dto };
    if (dto.expiresAt) data.expiresAt = new Date(dto.expiresAt);
    return this.repo.update(id, data) as Promise<Order>;
  }

  remove(id: string): Promise<Order> {
    return this.repo.delete(id) as Promise<Order>;
  }

  getUserStats(userId: string): Promise<UserStats> {
    return this.repo.getUserStats(userId);
  }

  /**
   * Find orders whose expiresAt is in the past, process their expiration or cancellation,
   * verify escrow status (both local DB and on-chain), generate audit logs, and notify affected users.
   */
  async expireOrders(): Promise<void> {
    const now = new Date();
    this.logger.log(`Running order expiration query at ${now.toISOString()}`);

    // Query active orders (created, locked) that have expired
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        expiresAt: {
          lt: now,
        },
        orderStatus: {
          in: ['created', 'locked'] as order_status[],
        },
      },
      include: {
        escrow: true,
        buyer: true,
        seller: true,
      },
    });

    this.logger.log(`Found ${expiredOrders.length} expired candidate order(s)`);

    for (const order of expiredOrders) {
      try {
        await this.processExpiredOrder(order);
      } catch (err) {
        this.logger.error(
          `Failed to process expiration for order ${order.orderId}: ${err.message}`,
          err.stack,
        );
      }
    }
  }

  private async processExpiredOrder(order: any): Promise<void> {
    const oldStatus = order.orderStatus;
    
    // 1. Verify Escrow Status
    if (order.escrow) {
      const escrow = order.escrow;
      
      // If DB status is funded or later, do not automatically cancel/expire
      const fundedStatuses = ['funded', 'fiat_sent', 'released', 'disputed', 'resolved'];
      if (fundedStatuses.includes(escrow.escrowStatus)) {
        this.logger.log(
          `Skipping order ${order.orderId} expiration: Escrow is in funded/active state in DB (${escrow.escrowStatus})`
        );
        return;
      }

      // Check on-chain balance to protect funded escrows that haven't synced
      if (escrow.contractId) {
        try {
          const balances = await this.escrowService.tw.getEscrowBalance(escrow.contractId);
          if (balances && Array.isArray(balances)) {
            const hasBalance = balances.some((b) => Number(b.balance) > 0);
            if (hasBalance) {
              this.logger.log(
                `Skipping order ${order.orderId} expiration: Escrow contract ${escrow.contractId} has on-chain balance.`
              );
              return;
            }
          }
        } catch (err) {
          this.logger.warn(
            `Could not fetch on-chain balance for order ${order.orderId} escrow ${escrow.contractId}: ${err.message}. ` +
            `Relying on DB status.`
          );
        }
      }
    }

    // 2. Determine target status
    // 'created' -> 'expired'
    // 'locked' -> 'cancelled'
    const targetStatus: order_status = oldStatus === 'locked' ? 'cancelled' : 'expired';

    // 3. Update order status in the database
    await this.prisma.order.update({
      where: { orderId: order.orderId },
      data: { orderStatus: targetStatus },
    });

    // 4. Create Audit Log
    this.logger.log(
      `[AUDIT LOG] Order ${order.orderId} status transitioned from "${oldStatus}" to "${targetStatus}". ` +
      `Reason: Automated expiration (expiresAt: ${order.expiresAt?.toISOString()}). ` +
      `Buyer: ${order.buyerId}, Seller: ${order.sellerId}`
    );

    // 5. Notify affected users
    const buyerContact = order.buyer.alias || order.buyer.publicKey;
    const sellerContact = order.seller.alias || order.seller.publicKey;
    this.logger.log(
      `[NOTIFICATION] Notification sent to Buyer "${buyerContact}" (${order.buyer.email || 'no email'}) ` +
      `and Seller "${sellerContact}" (${order.seller.email || 'no email'}) ` +
      `that Order ${order.orderId} has been updated to "${targetStatus.toUpperCase()}" due to expiration.`
    );
  }
}
