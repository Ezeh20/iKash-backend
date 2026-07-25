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
    getOnChainEscrowBalance: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      order: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    escrowServiceMock = {
      getOnChainEscrowBalance: jest.fn(),
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
    escrowServiceMock.getOnChainEscrowBalance.mockResolvedValue([
      { address: 'C_CONTRACT_2', balance: 0 },
    ]);
    prismaMock.order.update.mockResolvedValue({
      ...expiredOrder,
      orderStatus: 'cancelled',
    });

    await service.expireOrders();

    expect(escrowServiceMock.getOnChainEscrowBalance).toHaveBeenCalledWith(
      'C_CONTRACT_2',
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { orderId: 'order-2' },
      data: { orderStatus: 'cancelled' },
    });
  });

  it('should skip order expiration if the escrow status is fiat_sent or beyond', async () => {
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
        escrowStatus: 'fiat_sent',
      },
    };

    prismaMock.order.findMany.mockResolvedValue([expiredOrder]);

    await service.expireOrders();

    expect(escrowServiceMock.getOnChainEscrowBalance).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('should allow expiration/cancellation of a funded escrow if fiat payment was not sent', async () => {
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
        escrowStatus: 'funded',
      },
    };

    prismaMock.order.findMany.mockResolvedValue([expiredOrder]);
    escrowServiceMock.getOnChainEscrowBalance.mockResolvedValue([
      { address: 'C_CONTRACT_4', balance: 5.5 },
    ]);
    prismaMock.order.update.mockResolvedValue({
      ...expiredOrder,
      orderStatus: 'cancelled',
    });

    await service.expireOrders();

    expect(escrowServiceMock.getOnChainEscrowBalance).toHaveBeenCalledWith(
      'C_CONTRACT_4',
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { orderId: 'order-4' },
      data: { orderStatus: 'cancelled' },
    });
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
    escrowServiceMock.getOnChainEscrowBalance.mockRejectedValue(
      new Error('Network error'),
    );
    prismaMock.order.update.mockResolvedValue({
      ...expiredOrder,
      orderStatus: 'cancelled',
    });

    await service.expireOrders();

    expect(escrowServiceMock.getOnChainEscrowBalance).toHaveBeenCalledWith(
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

describe('OrderService.cancel', () => {
  let service: OrderService;
  let repo: {
    findById: jest.Mock;
    update: jest.Mock;
  };

  const baseOrder = {
    orderId: 'order-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    orderStatus: 'created',
    escrow: null as { escrowStatus: string } | null,
  };

  beforeEach(async () => {
    repo = {
      findById: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: OrderRepository, useValue: repo },
        { provide: EscrowService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get(OrderService);
  });

  it('cancels an order with no escrow yet', async () => {
    repo.findById.mockResolvedValue({ ...baseOrder });
    repo.update.mockResolvedValue({ ...baseOrder, orderStatus: 'cancelled' });

    await expect(service.cancel('order-1', 'buyer-1')).resolves.toEqual(
      expect.objectContaining({ orderStatus: 'cancelled' }),
    );
    expect(repo.update).toHaveBeenCalledWith('order-1', {
      orderStatus: 'cancelled',
    });
  });

  it('cancels an order whose escrow is only pending', async () => {
    repo.findById.mockResolvedValue({
      ...baseOrder,
      escrow: { escrowStatus: 'pending' },
    });
    repo.update.mockResolvedValue({ ...baseOrder, orderStatus: 'cancelled' });

    await expect(service.cancel('order-1', 'seller-1')).resolves.toBeDefined();
    expect(repo.update).toHaveBeenCalled();
  });

  it('cancels an order whose escrow is initialized but not funded', async () => {
    repo.findById.mockResolvedValue({
      ...baseOrder,
      escrow: { escrowStatus: 'initialized' },
    });
    repo.update.mockResolvedValue({ ...baseOrder, orderStatus: 'cancelled' });

    await expect(service.cancel('order-1', 'buyer-1')).resolves.toBeDefined();
    expect(repo.update).toHaveBeenCalled();
  });

  it('rejects cancellation from an unrelated user', async () => {
    repo.findById.mockResolvedValue({ ...baseOrder });

    await expect(service.cancel('order-1', 'stranger-1')).rejects.toThrow();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects cancellation when the order does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.cancel('missing-order', 'buyer-1')).rejects.toThrow();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it.each(['released', 'cancelled', 'expired', 'disputed'])(
    'rejects cancellation when the order is already "%s"',
    async (orderStatus) => {
      repo.findById.mockResolvedValue({ ...baseOrder, orderStatus });

      await expect(service.cancel('order-1', 'buyer-1')).rejects.toThrow();
      expect(repo.update).not.toHaveBeenCalled();
    },
  );

  it.each(['funded', 'fiat_sent', 'released', 'disputed', 'resolved'])(
    'rejects cancellation when the escrow is already "%s"',
    async (escrowStatus) => {
      repo.findById.mockResolvedValue({
        ...baseOrder,
        escrow: { escrowStatus },
      });

      await expect(service.cancel('order-1', 'buyer-1')).rejects.toThrow();
      expect(repo.update).not.toHaveBeenCalled();
    },
  );
});
