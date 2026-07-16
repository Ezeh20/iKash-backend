jest.mock('@stellar/stellar-sdk', () => ({}));

import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { OrderRepository } from './order.repository';
import { EscrowService } from '../escrow/escrow.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('OrderService - Expiration and Cancellation Job', () => {
  let service: OrderService;
  let prismaMock: {
    order: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let escrowServiceMock: {
    tw: {
      getEscrowBalance: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      order: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    escrowServiceMock = {
      tw: {
        getEscrowBalance: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: OrderRepository, useValue: {} },
        { provide: EscrowService, useValue: escrowServiceMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should do nothing if no expired orders are found', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);

    await service.expireOrders();

    expect(prismaMock.order.findMany).toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('should transition a created order with no escrow to expired status', async () => {
    const expiredOrder = {
      orderId: 'order-1',
      orderStatus: 'created',
      expiresAt: new Date(Date.now() - 10000),
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      buyer: {
        alias: 'buyer-alias',
        publicKey: 'G_BUYER',
        email: 'buyer@example.com',
      },
      seller: {
        alias: 'seller-alias',
        publicKey: 'G_SELLER',
        email: 'seller@example.com',
      },
      escrow: null,
    };

    prismaMock.order.findMany.mockResolvedValue([expiredOrder]);
    prismaMock.order.update.mockResolvedValue({
      ...expiredOrder,
      orderStatus: 'expired',
    });

    await service.expireOrders();

    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      data: { orderStatus: 'expired' },
    });
  });

  it('should transition a locked order with an unfunded escrow to cancelled status', async () => {
    const expiredOrder = {
      orderId: 'order-2',
      orderStatus: 'locked',
      expiresAt: new Date(Date.now() - 10000),
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      buyer: {
        alias: 'buyer-alias',
        publicKey: 'G_BUYER',
        email: 'buyer@example.com',
      },
      seller: {
        alias: 'seller-alias',
        publicKey: 'G_SELLER',
        email: 'seller@example.com',
      },
      escrow: {
        escrowId: 'escrow-2',
        contractId: 'C_CONTRACT_2',
        escrowStatus: 'initialized',
      },
    };

    prismaMock.order.findMany.mockResolvedValue([expiredOrder]);
    escrowServiceMock.tw.getEscrowBalance.mockResolvedValue([
      { address: 'C_CONTRACT_2', balance: 0 },
    ]);
    prismaMock.order.update.mockResolvedValue({
      ...expiredOrder,
      orderStatus: 'cancelled',
    });

    await service.expireOrders();

    expect(escrowServiceMock.tw.getEscrowBalance).toHaveBeenCalledWith(
      'C_CONTRACT_2',
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { orderId: 'order-2' },
      data: { orderStatus: 'cancelled' },
    });
  });

  it('should skip order expiration if the escrow status is marked as funded in the database', async () => {
    const expiredOrder = {
      orderId: 'order-3',
      orderStatus: 'locked',
      expiresAt: new Date(Date.now() - 10000),
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      buyer: {
        alias: 'buyer-alias',
        publicKey: 'G_BUYER',
        email: 'buyer@example.com',
      },
      seller: {
        alias: 'seller-alias',
        publicKey: 'G_SELLER',
        email: 'seller@example.com',
      },
      escrow: {
        escrowId: 'escrow-3',
        contractId: 'C_CONTRACT_3',
        escrowStatus: 'funded',
      },
    };

    prismaMock.order.findMany.mockResolvedValue([expiredOrder]);

    await service.expireOrders();

    expect(escrowServiceMock.tw.getEscrowBalance).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('should skip order expiration if the escrow contract has on-chain balance even if DB is initialized', async () => {
    const expiredOrder = {
      orderId: 'order-4',
      orderStatus: 'locked',
      expiresAt: new Date(Date.now() - 10000),
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      buyer: {
        alias: 'buyer-alias',
        publicKey: 'G_BUYER',
        email: 'buyer@example.com',
      },
      seller: {
        alias: 'seller-alias',
        publicKey: 'G_SELLER',
        email: 'seller@example.com',
      },
      escrow: {
        escrowId: 'escrow-4',
        contractId: 'C_CONTRACT_4',
        escrowStatus: 'initialized',
      },
    };

    prismaMock.order.findMany.mockResolvedValue([expiredOrder]);
    escrowServiceMock.tw.getEscrowBalance.mockResolvedValue([
      { address: 'C_CONTRACT_4', balance: 5.5 },
    ]);

    await service.expireOrders();

    expect(escrowServiceMock.tw.getEscrowBalance).toHaveBeenCalledWith(
      'C_CONTRACT_4',
    );
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('should proceed to cancel if checking on-chain balance fails but DB status is initialized', async () => {
    const expiredOrder = {
      orderId: 'order-5',
      orderStatus: 'locked',
      expiresAt: new Date(Date.now() - 10000),
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      buyer: {
        alias: 'buyer-alias',
        publicKey: 'G_BUYER',
        email: 'buyer@example.com',
      },
      seller: {
        alias: 'seller-alias',
        publicKey: 'G_SELLER',
        email: 'seller@example.com',
      },
      escrow: {
        escrowId: 'escrow-5',
        contractId: 'C_CONTRACT_5',
        escrowStatus: 'initialized',
      },
    };

    prismaMock.order.findMany.mockResolvedValue([expiredOrder]);
    escrowServiceMock.tw.getEscrowBalance.mockRejectedValue(
      new Error('Network error'),
    );
    prismaMock.order.update.mockResolvedValue({
      ...expiredOrder,
      orderStatus: 'cancelled',
    });

    await service.expireOrders();

    expect(escrowServiceMock.tw.getEscrowBalance).toHaveBeenCalledWith(
      'C_CONTRACT_5',
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { orderId: 'order-5' },
      data: { orderStatus: 'cancelled' },
    });
  });

  it('should handle order-level failures and continue processing other orders in the batch', async () => {
    const expiredOrder1 = {
      orderId: 'order-6',
      orderStatus: 'created',
      expiresAt: new Date(Date.now() - 10000),
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      buyer: {
        alias: 'buyer-alias',
        publicKey: 'G_BUYER',
        email: 'buyer@example.com',
      },
      seller: {
        alias: 'seller-alias',
        publicKey: 'G_SELLER',
        email: 'seller@example.com',
      },
      escrow: null,
    };

    const expiredOrder2 = {
      orderId: 'order-7',
      orderStatus: 'created',
      expiresAt: new Date(Date.now() - 10000),
      buyerId: 'buyer-2',
      sellerId: 'seller-2',
      buyer: {
        alias: 'buyer-2-alias',
        publicKey: 'G_BUYER_2',
        email: 'buyer2@example.com',
      },
      seller: {
        alias: 'seller-2-alias',
        publicKey: 'G_SELLER_2',
        email: 'seller2@example.com',
      },
      escrow: null,
    };

    prismaMock.order.findMany.mockResolvedValue([expiredOrder1, expiredOrder2]);

    // Fail first order update, succeed second
    prismaMock.order.update
      .mockRejectedValueOnce(new Error('Database unique constraint failed'))
      .mockResolvedValueOnce({ ...expiredOrder2, orderStatus: 'expired' });

    await service.expireOrders();

    expect(prismaMock.order.update).toHaveBeenNthCalledWith(1, {
      where: { orderId: 'order-6' },
      data: { orderStatus: 'expired' },
    });
    expect(prismaMock.order.update).toHaveBeenNthCalledWith(2, {
      where: { orderId: 'order-7' },
      data: { orderStatus: 'expired' },
    });
  });
});
