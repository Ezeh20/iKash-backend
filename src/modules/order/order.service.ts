import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderRepository } from './order.repository';
import { EscrowService } from '../escrow/escrow.service';
import { AppException, ErrorCode } from '../../common/errors';
import {
  Order,
  order_status,
  escrow_status,
  EscrowOnChain,
} from '@prisma/client';

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

  /**
   * Cancel an order before fiat payment has been marked as completed.
   *
   * Rules (see issue #42):
   *  - Only the buyer or seller on the order may cancel it.
   *  - Terminal order states (released, cancelled, expired, disputed) cannot
   *    be cancelled again.
   *  - If an on-chain escrow exists, cancellation is only allowed while the
   *    escrow is still "pending" or "initialized" — i.e. before any funds
   *    have actually moved on-chain. Once the escrow is "funded",
   *    "fiat_sent", "released", "disputed", or "resolved", direct
   *    cancellation is rejected: this codebase has no refund flow, so
   *    unwinding a funded escrow must go through support instead of being
   *    silently attempted here.
   */
  async cancel(id: string, userId: string): Promise<Order> {
    // OrderRepository.findById includes the `escrow` relation at runtime
    // (see order.repository.ts), but its declared return type is the plain
    // `Order` model, which has no static `escrow` field. This assertion
    // reflects what the query actually returns.
    const order = (await this.repo.findById(id)) as
      | (Order & { escrow: EscrowOnChain | null })
      | null;

    if (!order) {
      throw new AppException(
        ErrorCode.ORDER_NOT_FOUND,
        `Order ${id} not found`,
      );
    }

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED_ACTION,
        'Only the buyer or seller on this order can cancel it',
      );
    }

    const terminalOrderStatuses: order_status[] = [
      'released',
      'cancelled',
      'expired',
      'disputed',
    ];
    if (terminalOrderStatuses.includes(order.orderStatus)) {
      throw new AppException(
        ErrorCode.ORDER_CANCELLATION_NOT_ALLOWED,
        `Order ${id} cannot be cancelled because it is already "${order.orderStatus}"`,
      );
    }

    const blockedEscrowStatuses: escrow_status[] = [
      'funded',
      'fiat_sent',
      'released',
      'disputed',
      'resolved',
    ];
    if (
      order.escrow &&
      blockedEscrowStatuses.includes(order.escrow.escrowStatus)
    ) {
      throw new AppException(
        ErrorCode.ORDER_CANCELLATION_NOT_ALLOWED,
        `Order ${id} cannot be cancelled because its escrow is in status "${order.escrow.escrowStatus}". ` +
          'Funds have moved on-chain; this must be resolved through support rather than direct cancellation.',
      );
    }

    this.logger.log(
      `Order ${id} cancelled by user ${userId} (previous status: "${order.orderStatus}")`,
    );

    return this.repo.update(id, {
      orderStatus: 'cancelled' as order_status,
    }) as Promise<Order>;
  }

  getUserStats(userId: string): Promise<UserStats> {
    return this.repo.getUserStats(userId);
  }
}
