import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderRepository } from './order.repository';
import { EscrowService } from '../escrow/escrow.service';
import { AppException, ErrorCode } from '../../common/errors';
import { Order, order_status } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  AuditAction,
  AuditResult,
} from '../audit-log/enums/audit-action.enum';

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
    private readonly auditLogService: AuditLogService,
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

    await this.auditLogService.create({
      userId: dto.buyerId,
      action: AuditAction.ORDER_CREATED,
      resourceType: 'Order',
      resourceId: orderId,
      result: AuditResult.SUCCESS,
      metadata: { offerId: dto.offerId, sellerId: dto.sellerId },
    });

    // ── Return combined response ────────────────────────────────────────
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

  async update(id: string, dto: UpdateOrderDto): Promise<Order> {
    const data: Record<string, unknown> = { ...dto };
    if (dto.expiresAt) data.expiresAt = new Date(dto.expiresAt);
    const updated = (await this.repo.update(id, data)) as Order;

    // Record cancellation/expiration explicitly when the update sets the
    // order into one of those terminal statuses; other field updates
    // (e.g. expiresAt extension) are not separately audited here.
    if (dto.orderStatus === 'cancelled') {
      await this.auditLogService.create({
        userId: updated.buyerId,
        action: AuditAction.ORDER_CANCELLED,
        resourceType: 'Order',
        resourceId: id,
        result: AuditResult.SUCCESS,
      });
    } else if (dto.orderStatus === 'expired') {
      await this.auditLogService.create({
        userId: updated.buyerId,
        action: AuditAction.ORDER_EXPIRED,
        resourceType: 'Order',
        resourceId: id,
        result: AuditResult.SUCCESS,
      });
    }

    return updated;
  }

  async remove(id: string): Promise<Order> {
    const removed = (await this.repo.delete(id)) as Order;

    await this.auditLogService.create({
      userId: removed.buyerId,
      action: AuditAction.ORDER_CANCELLED,
      resourceType: 'Order',
      resourceId: id,
      result: AuditResult.SUCCESS,
      metadata: { reason: 'deleted' },
    });

    return removed;
  }

  getUserStats(userId: string): Promise<UserStats> {
    return this.repo.getUserStats(userId);
  }
}