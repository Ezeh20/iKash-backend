import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StellarListenerService } from './stellar-listener.service';
import { StellarEventParserService } from './stellar-event-parser.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { OnChainEscrowEvent } from './types/stellar-event.types';
import { AuditAction, AuditResult } from '../audit-log/enums/audit-action.enum';

describe('StellarListenerService', () => {
  let service: StellarListenerService;
  let prismaMock: any;
  let auditLogMock: any;

  const mockEscrow = {
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
    prismaMock = {
      escrowOnChain: {
        findFirst: jest.fn().mockResolvedValue(mockEscrow),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ ...mockEscrow, escrowStatus: 'funded' }),
      },
      order: {
        update: jest.fn().mockResolvedValue({ orderId: 'order-123', orderStatus: 'locked' }),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prismaMock)),
    };

    auditLogMock = {
      create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarListenerService,
        StellarEventParserService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => {
              if (key === 'STELLAR_RPC_URL') return 'https://soroban-testnet.stellar.org';
              if (key === 'TRUSTLESS_WORK_CONTRACT_ID') return 'CONTRACT_ABC';
              return defaultVal;
            }),
          },
        },
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogMock },
      ],
    }).compile();

    service = module.get<StellarListenerService>(StellarListenerService);
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

    const result = await service.processEvent(event);

    expect(result).toBe(true);
    expect(prismaMock.escrowOnChain.update).toHaveBeenCalledWith({
      where: { escrowId: 'escrow-123' },
      data: expect.objectContaining({
        escrowStatus: 'funded',
        txHashLock: 'txhash_fund_123',
      }),
    });

    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { orderId: 'order-123' },
      data: { orderStatus: 'locked' },
    });

    expect(auditLogMock.create).toHaveBeenCalledWith({
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

    const firstResult = await service.processEvent(event);
    expect(firstResult).toBe(true);

    const secondResult = await service.processEvent(event);
    expect(secondResult).toBe(false);
    expect(prismaMock.escrowOnChain.update).toHaveBeenCalledTimes(1);
  });

  it('should handle ESCROW_RELEASED event', async () => {
    prismaMock.escrowOnChain.findFirst.mockResolvedValueOnce({
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

    const result = await service.processEvent(event);

    expect(result).toBe(true);
    expect(prismaMock.escrowOnChain.update).toHaveBeenCalledWith({
      where: { escrowId: 'escrow-123' },
      data: expect.objectContaining({
        escrowStatus: 'released',
        txHashRelease: 'txhash_release_456',
      }),
    });

    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { orderId: 'order-123' },
      data: { orderStatus: 'released' },
    });

    expect(auditLogMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ESCROW_RELEASED,
        resourceId: 'escrow-123',
      }),
    );
  });

  it('should handle ESCROW_REFUNDED event', async () => {
    prismaMock.escrowOnChain.findFirst.mockResolvedValueOnce({
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

    const result = await service.processEvent(event);

    expect(result).toBe(true);
    expect(prismaMock.escrowOnChain.update).toHaveBeenCalledWith({
      where: { escrowId: 'escrow-123' },
      data: expect.objectContaining({
        escrowStatus: 'resolved',
        txHashRelease: 'txhash_refund_789',
      }),
    });

    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { orderId: 'order-123' },
      data: { orderStatus: 'cancelled' },
    });
  });

  it('should return false gracefully if escrow record is not found', async () => {
    prismaMock.escrowOnChain.findFirst.mockResolvedValueOnce(null);

    const event: OnChainEscrowEvent = {
      eventId: 'evt-999:0',
      eventType: 'ESCROW_FUNDED',
      contractId: 'UNKNOWN_CONTRACT',
      txHash: 'txhash_unknown',
      ledgerSequence: 2000,
      eventIndex: 0,
    };

    const result = await service.processEvent(event);
    expect(result).toBe(false);
    expect(prismaMock.escrowOnChain.update).not.toHaveBeenCalled();
  });
});
