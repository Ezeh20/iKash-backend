/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StellarListenerService } from './stellar-listener.service';
import { StellarEventParserService } from './stellar-event-parser.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { OnChainEscrowEvent } from './types/stellar-event.types';
import { AuditAction, AuditResult } from '../audit-log/enums/audit-action.enum';
import { EscrowService } from '../escrow/escrow.service';
import { OrderService } from '../order/order.service';

interface MockEscrowRecord {
  escrowId: string;
  orderId: string;
  contractId: string;
  escrowStatus: string;
  order: {
    orderId: string;
    buyerId: string;
    sellerId: string;
    orderStatus: string;
  };
}

describe('StellarListenerService', () => {
  let service: StellarListenerService;
  let findFirstEscrowMock: jest.Mock;
  let updateEscrowMock: jest.Mock;
  let updateOrderMock: jest.Mock;
  let createAuditMock: jest.Mock;

  const mockEscrow: MockEscrowRecord = {
    escrowId: 'escrow-123',
    orderId: 'order-123',
    contractId: 'CONTRACT_ABC',
    escrowStatus: 'initialized',
    order: {
      orderId: 'order-123',
      buyerId: 'buyer-user-1',
      sellerId: 'seller-user-2',
      orderStatus: 'created',
    },
  };

  beforeEach(async () => {
    findFirstEscrowMock = jest.fn().mockResolvedValue(mockEscrow);
    updateEscrowMock = jest
      .fn()
      .mockResolvedValue({ ...mockEscrow, escrowStatus: 'funded' });
    updateOrderMock = jest
      .fn()
      .mockResolvedValue({ orderId: 'order-123', orderStatus: 'locked' });
    createAuditMock = jest.fn().mockResolvedValue({ id: 'audit-log-1' });

    const prismaMock = {
      escrowOnChain: {
        findFirst: findFirstEscrowMock,
        findMany: jest.fn().mockResolvedValue([]),
        update: updateEscrowMock,
      },
      order: {
        update: updateOrderMock,
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
          cb(prismaMock),
        ),
    };

    const auditLogMock = {
      create: createAuditMock,
    };

    const escrowServiceMock = {
      validateStatusTransition: jest.fn(),
      isTerminalOrAlreadyProcessed: jest.fn(
        (status: string, eventType: string) => {
          if (
            eventType === 'ESCROW_FUNDED' &&
            ['funded', 'released', 'resolved'].includes(status)
          )
            return true;
          if (
            eventType === 'ESCROW_RELEASED' &&
            ['released', 'resolved'].includes(status)
          )
            return true;
          if (eventType === 'ESCROW_REFUNDED' && ['resolved'].includes(status))
            return true;
          return false;
        },
      ),
      updateStatusFromOnChain: jest.fn(
        (
          escrowId: string,
          newStatus: string,
          txHash?: string,
          eventType?: string,
        ) => {
          const data: Record<string, unknown> = { escrowStatus: newStatus };
          if (eventType === 'ESCROW_FUNDED' && txHash) data.txHashLock = txHash;
          if (
            (eventType === 'ESCROW_RELEASED' ||
              eventType === 'ESCROW_REFUNDED') &&
            txHash
          )
            data.txHashRelease = txHash;
          return updateEscrowMock({
            where: { escrowId },
            data,
          }) as Promise<unknown>;
        },
      ),
    };

    const orderServiceMock = {
      updateStatusFromOnChain: jest.fn((orderId: string, newStatus: string) => {
        return updateOrderMock({
          where: { orderId },
          data: { orderStatus: newStatus },
        }) as Promise<unknown>;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarListenerService,
        StellarEventParserService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => {
              if (key === 'STELLAR_RPC_URL')
                return 'https://soroban-testnet.stellar.org';
              if (key === 'TRUSTLESS_WORK_CONTRACT_ID') return 'CONTRACT_ABC';
              return defaultVal;
            }),
          },
        },
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogMock },
        { provide: EscrowService, useValue: escrowServiceMock },
        { provide: OrderService, useValue: orderServiceMock },
      ],
    }).compile();

    service = module.get(StellarListenerService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process ESCROW_FUNDED event and update database & audit logs', async () => {
    const event: OnChainEscrowEvent = {
      eventId: 'evt-100:0',
      eventType: 'ESCROW_FUNDED',
      contractId: 'CONTRACT_ABC',
      txHash: 'txhash_fund_123',
      ledgerSequence: 1000,
      eventIndex: 0,
      engagementId: 'order-123',
    };

    const processed = await service.processEvent(event);
    expect(processed).toBe(true);
    expect(updateEscrowMock).toHaveBeenCalledWith({
      where: { escrowId: 'escrow-123' },
      data: expect.objectContaining({
        escrowStatus: 'funded',
        txHashLock: 'txhash_fund_123',
      }),
    });

    expect(updateOrderMock).toHaveBeenCalledWith({
      where: { orderId: 'order-123' },
      data: { orderStatus: 'locked' },
    });

    expect(createAuditMock).toHaveBeenCalledWith({
      action: AuditAction.ESCROW_FUNDED,
      resourceType: 'Escrow',
      resourceId: 'escrow-123',
      result: AuditResult.SUCCESS,
      metadata: expect.objectContaining({
        contractId: 'CONTRACT_ABC',
        txHash: 'txhash_fund_123',
      }),
    });
  });

  it('should be idempotent and ignore duplicate event on second processing', async () => {
    const event: OnChainEscrowEvent = {
      eventId: 'evt-100:0',
      eventType: 'ESCROW_FUNDED',
      contractId: 'CONTRACT_ABC',
      txHash: 'txhash_fund_123',
      ledgerSequence: 1000,
      eventIndex: 0,
    };

    const first = await service.processEvent(event);
    expect(first).toBe(true);
    const second = await service.processEvent(event);
    expect(second).toBe(false);
    expect(updateEscrowMock).toHaveBeenCalledTimes(1);
  });

  it('should handle ESCROW_RELEASED event', async () => {
    findFirstEscrowMock.mockResolvedValueOnce({
      ...mockEscrow,
      escrowStatus: 'funded',
    });

    const event: OnChainEscrowEvent = {
      eventId: 'evt-101:0',
      eventType: 'ESCROW_RELEASED',
      contractId: 'CONTRACT_ABC',
      txHash: 'txhash_release_456',
      ledgerSequence: 1005,
      eventIndex: 0,
    };

    const released = await service.processEvent(event);
    expect(released).toBe(true);
    expect(updateEscrowMock).toHaveBeenCalledWith({
      where: { escrowId: 'escrow-123' },
      data: expect.objectContaining({
        escrowStatus: 'released',
        txHashRelease: 'txhash_release_456',
      }),
    });

    expect(updateOrderMock).toHaveBeenCalledWith({
      where: { orderId: 'order-123' },
      data: { orderStatus: 'released' },
    });

    expect(createAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ESCROW_RELEASED,
        resourceId: 'escrow-123',
      }),
    );
  });

  it('should handle ESCROW_REFUNDED event', async () => {
    findFirstEscrowMock.mockResolvedValueOnce({
      ...mockEscrow,
      escrowStatus: 'funded',
    });

    const event: OnChainEscrowEvent = {
      eventId: 'evt-102:0',
      eventType: 'ESCROW_REFUNDED',
      contractId: 'CONTRACT_ABC',
      txHash: 'txhash_refund_789',
      ledgerSequence: 1010,
      eventIndex: 0,
    };

    const refunded = await service.processEvent(event);
    expect(refunded).toBe(true);
    expect(updateEscrowMock).toHaveBeenCalledWith({
      where: { escrowId: 'escrow-123' },
      data: expect.objectContaining({
        escrowStatus: 'resolved',
        txHashRelease: 'txhash_refund_789',
      }),
    });

    expect(updateOrderMock).toHaveBeenCalledWith({
      where: { orderId: 'order-123' },
      data: { orderStatus: 'cancelled' },
    });
  });

  it('should return false gracefully if escrow record is not found', async () => {
    findFirstEscrowMock.mockResolvedValueOnce(null);

    const event: OnChainEscrowEvent = {
      eventId: 'evt-999:0',
      eventType: 'ESCROW_FUNDED',
      contractId: 'UNKNOWN_CONTRACT',
      txHash: 'txhash_unknown',
      ledgerSequence: 2000,
      eventIndex: 0,
    };

    const missing = await service.processEvent(event);
    expect(missing).toBe(false);
    expect(updateEscrowMock).not.toHaveBeenCalled();
  });
});
