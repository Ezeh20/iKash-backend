jest.mock('@stellar/stellar-sdk', () => {
  const Horizon = {
    Server: jest.fn().mockImplementation(() => ({
      loadAccount: jest.fn(),
    })),
  };
  return {
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015',
    },
    Horizon,
    Asset: {
      native: jest.fn(),
    },
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: jest.fn().mockReturnValue('dummy-key'),
      }),
    },
    BASE_FEE: '100',
    FeeBumpTransaction: jest.fn(),
    Memo: {
      text: jest.fn(),
    },
    Operation: {
      payment: jest.fn(),
    },
    Transaction: jest.fn(),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      addMemo: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({
        sign: jest.fn(),
        toXDR: jest.fn().mockReturnValue('dummy-xdr'),
      }),
    })),
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { OrderService } from '../src/modules/order/order.service';
import { TrustlessWorkService } from '../src/modules/escrow/trustless-work.service';

import { Decimal } from '@prisma/client/runtime/library';
import type {
  order_status,
  offer_status,
  offer_type,
  kyc_status,
  app_role,
  escrow_status,
} from '@prisma/client';

interface StoredAppUser {
  userId: string;
  publicKey: string;
  alias: string | null;
  username: string | null;
  kycStatus: kyc_status;
  role: app_role;
  kycUpdatedAt: Date | null;
  totalVolume: Decimal;
  createdAt: Date;
  currentNonce: string | null;
  email: string | null;
  profileImageUrl: string | null;
  notificationsEnabled: boolean;
  pendingAccountInfo: boolean;
  preferredCurrency: string | null;
  bio: string | null;
  securityUpdates: boolean;
}

interface StoredOffer {
  offerId: string;
  creatorId: string;
  type: offer_type;
  assetCode: string;
  price: Decimal;
  minAmount: Decimal;
  maxAmount: Decimal;
  status: offer_status;
  executed: boolean;
}

interface StoredOrder {
  orderId: string;
  offerId: string;
  buyerId: string;
  sellerId: string;
  assetAmount: Decimal;
  fiatAmount: Decimal;
  orderStatus: order_status;
  expiresAt: Date | null;
}

interface StoredEscrow {
  escrowId: string;
  orderId: string;
  txHashLock: string | null;
  txHashRelease: string | null;
  amount: Decimal | null;
  buyerAddress: string | null;
  contractId: string | null;
  escrowStatus: escrow_status;
  sellerAddress: string | null;
  evidenceUrl: string | null;
}

class FakePrismaService {
  readonly users = new Map<string, StoredAppUser>();
  readonly offers = new Map<string, StoredOffer>();
  readonly orders = new Map<string, StoredOrder>();
  readonly escrows = new Map<string, StoredEscrow>();
  private idCounter = 1;

  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }

  onModuleInit(): Promise<void> {
    return Promise.resolve();
  }

  appUser = {
    upsert: ({
      where,
      create,
      update,
    }: {
      where: { publicKey?: string; userId?: string };
      create: {
        publicKey: string;
        alias?: string | null;
        username?: string | null;
        kycStatus?: kyc_status;
      };
      update: Partial<StoredAppUser>;
    }): Promise<StoredAppUser> => {
      let user = Array.from(this.users.values()).find(
        (u) =>
          (where.publicKey && u.publicKey === where.publicKey) ||
          (where.userId && u.userId === where.userId),
      );
      if (user) {
        Object.assign(user, update);
      } else {
        user = {
          userId: `user-${this.idCounter++}`,
          publicKey: create.publicKey,
          alias: create.alias ?? null,
          username: create.username ?? null,
          kycStatus: create.kycStatus ?? ('pending' as kyc_status),
          role: 'USER' as app_role,
          kycUpdatedAt: null,
          totalVolume: new Decimal(0),
          createdAt: new Date(),
          currentNonce: null,
          email: null,
          profileImageUrl: null,
          notificationsEnabled: true,
          pendingAccountInfo: true,
          preferredCurrency: null,
          bio: null,
          securityUpdates: true,
        };
        this.users.set(user.userId, user);
      }
      return Promise.resolve({ ...user });
    },
    deleteMany: ({
      where,
    }: {
      where: { userId: { in: string[] } };
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const id of where.userId.in) {
        if (this.users.delete(id)) count += 1;
      }
      return Promise.resolve({ count });
    },
  };

  offer = {
    create: ({
      data,
    }: {
      data: {
        creatorId: string;
        type: offer_type;
        assetCode: string;
        price: number | Decimal;
        minAmount: number | Decimal;
        maxAmount: number | Decimal;
        status: offer_status;
      };
    }): Promise<StoredOffer> => {
      const record: StoredOffer = {
        offerId: `offer-${this.idCounter++}`,
        creatorId: data.creatorId,
        type: data.type,
        assetCode: data.assetCode,
        price: new Decimal(data.price),
        minAmount: new Decimal(data.minAmount),
        maxAmount: new Decimal(data.maxAmount),
        status: data.status,
        executed: false,
      };
      this.offers.set(record.offerId, record);
      return Promise.resolve({ ...record });
    },
    deleteMany: ({
      where,
    }: {
      where: { creatorId: string };
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const [id, o] of this.offers.entries()) {
        if (o.creatorId === where.creatorId) {
          this.offers.delete(id);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
  };

  order = {
    create: ({
      data,
    }: {
      data: {
        offerId: string;
        buyerId: string;
        sellerId: string;
        assetAmount: number | Decimal;
        fiatAmount: number | Decimal;
        orderStatus: order_status;
        expiresAt?: Date | null;
      };
    }): Promise<StoredOrder> => {
      const record: StoredOrder = {
        orderId: `order-${this.idCounter++}`,
        offerId: data.offerId,
        buyerId: data.buyerId,
        sellerId: data.sellerId,
        assetAmount: new Decimal(data.assetAmount),
        fiatAmount: new Decimal(data.fiatAmount),
        orderStatus: data.orderStatus,
        expiresAt: data.expiresAt ?? null,
      };
      this.orders.set(record.orderId, record);
      return Promise.resolve({ ...record });
    },
    findMany: ({
      where,
      include,
    }: {
      where?: {
        expiresAt?: { lt: Date };
        orderStatus?: { in: order_status[] };
      };
      include?: {
        escrow?: boolean;
        buyer?: boolean;
        seller?: boolean;
      };
    }): Promise<
      Array<
        StoredOrder & {
          escrow: StoredEscrow | null;
          buyer: StoredAppUser;
          seller: StoredAppUser;
        }
      >
    > => {
      let list = Array.from(this.orders.values());
      if (where?.expiresAt?.lt) {
        const ltTime = where.expiresAt.lt.getTime();
        list = list.filter(
          (o) => o.expiresAt !== null && o.expiresAt.getTime() < ltTime,
        );
      }
      if (where?.orderStatus?.in) {
        const statusIn = where.orderStatus.in;
        list = list.filter((o) => statusIn.includes(o.orderStatus));
      }
      const results = list.map((order) => {
        let escrow: StoredEscrow | null = null;
        if (include?.escrow) {
          escrow =
            Array.from(this.escrows.values()).find(
              (e) => e.orderId === order.orderId,
            ) ?? null;
        }
        const buyer = this.users.get(order.buyerId)!;
        const seller = this.users.get(order.sellerId)!;
        return {
          ...order,
          escrow,
          buyer,
          seller,
        };
      });
      return Promise.resolve(results);
    },
    findUnique: ({
      where,
    }: {
      where: { orderId: string };
    }): Promise<StoredOrder | null> => {
      const order = this.orders.get(where.orderId);
      return Promise.resolve(order ? { ...order } : null);
    },
    update: ({
      where,
      data,
    }: {
      where: { orderId: string };
      data: { orderStatus: order_status };
    }): Promise<StoredOrder> => {
      const order = this.orders.get(where.orderId);
      if (!order) {
        return Promise.reject(new Error(`Order ${where.orderId} not found`));
      }
      order.orderStatus = data.orderStatus;
      return Promise.resolve({ ...order });
    },
    deleteMany: ({
      where,
    }: {
      where: { buyerId: string; sellerId: string };
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const [id, o] of this.orders.entries()) {
        if (o.buyerId === where.buyerId && o.sellerId === where.sellerId) {
          this.orders.delete(id);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
  };

  escrowOnChain = {
    create: ({
      data,
    }: {
      data: {
        orderId: string;
        contractId: string;
        buyerAddress: string;
        sellerAddress: string;
        amount: number | Decimal;
        escrowStatus: escrow_status;
      };
    }): Promise<StoredEscrow> => {
      const record: StoredEscrow = {
        escrowId: `escrow-${this.idCounter++}`,
        orderId: data.orderId,
        contractId: data.contractId,
        buyerAddress: data.buyerAddress,
        sellerAddress: data.sellerAddress,
        amount: new Decimal(data.amount),
        escrowStatus: data.escrowStatus,
        txHashLock: null,
        txHashRelease: null,
        evidenceUrl: null,
      };
      this.escrows.set(record.escrowId, record);
      return Promise.resolve({ ...record });
    },
    findUnique: ({
      where,
    }: {
      where: { escrowId: string };
    }): Promise<StoredEscrow | null> => {
      const escrow = this.escrows.get(where.escrowId);
      return Promise.resolve(escrow ? { ...escrow } : null);
    },
    findFirst: ({
      where,
    }: {
      where: { orderId: string };
    }): Promise<StoredEscrow | null> => {
      const escrow =
        Array.from(this.escrows.values()).find(
          (e) => e.orderId === where.orderId,
        ) ?? null;
      return Promise.resolve(escrow ? { ...escrow } : null);
    },
  };
}

describe('Order Expiration Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orderService: OrderService;
  let twServiceMock: {
    getEscrowBalance: jest.Mock;
  };

  let buyerId: string;
  let sellerId: string;
  let offerId: string;

  beforeAll(async () => {
    twServiceMock = {
      getEscrowBalance: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useClass(FakePrismaService)
      .overrideProvider(TrustlessWorkService)
      .useValue(twServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    orderService = app.get<OrderService>(OrderService);

    // Seed/Ensure dummy users exist
    const buyer = await prisma.appUser.upsert({
      where: { publicKey: 'GBUYERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345' },
      update: {},
      create: {
        publicKey: 'GBUYERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        alias: 'e2eBuyer',
        kycStatus: 'approved',
      },
    });
    buyerId = buyer.userId;

    const seller = await prisma.appUser.upsert({
      where: { publicKey: 'GSELLERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345' },
      update: {},
      create: {
        publicKey: 'GSELLERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        alias: 'e2eSeller',
        kycStatus: 'approved',
      },
    });
    sellerId = seller.userId;

    // Seed/Ensure dummy offer exists
    const offer = await prisma.offer.create({
      data: {
        creatorId: sellerId,
        type: 'sell',
        assetCode: 'USDC',
        price: 1.0,
        minAmount: 1.0,
        maxAmount: 100.0,
        status: 'active',
      },
    });
    offerId = offer.offerId;
  });

  afterAll(async () => {
    // Cleanup seeded tests data
    if (buyerId && sellerId) {
      await prisma.order.deleteMany({
        where: {
          buyerId,
          sellerId,
        },
      });
      await prisma.offer.deleteMany({
        where: {
          creatorId: sellerId,
        },
      });
      await prisma.appUser.deleteMany({
        where: {
          userId: {
            in: [buyerId, sellerId],
          },
        },
      });
    }

    if (app) {
      await app.close();
    }
  });

  it('should expire and cancel correct orders while ignoring protected/future ones', async () => {
    const now = new Date();

    // 1. Order A: expired, 'created' status, no escrow -> should become 'expired'
    const orderA = await prisma.order.create({
      data: {
        offerId,
        buyerId,
        sellerId,
        assetAmount: 10,
        fiatAmount: 10,
        orderStatus: 'created',
        expiresAt: new Date(now.getTime() - 10 * 60 * 1000), // 10 mins ago
      },
    });

    // 2. Order B: expired, 'locked' status, escrow initialized (not funded) -> should become 'cancelled'
    const orderB = await prisma.order.create({
      data: {
        offerId,
        buyerId,
        sellerId,
        assetAmount: 20,
        fiatAmount: 20,
        orderStatus: 'locked',
        expiresAt: new Date(now.getTime() - 10 * 60 * 1000), // 10 mins ago
      },
    });
    const escrowB = await prisma.escrowOnChain.create({
      data: {
        orderId: orderB.orderId,
        contractId: 'CCONTACTE2EORDERB',
        buyerAddress: 'GBUYERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        sellerAddress: 'GSELLERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        amount: 20,
        escrowStatus: 'initialized',
      },
    });

    // 3. Order C: active but NOT expired (future expiresAt) -> should remain unchanged
    const orderC = await prisma.order.create({
      data: {
        offerId,
        buyerId,
        sellerId,
        assetAmount: 30,
        fiatAmount: 30,
        orderStatus: 'created',
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000), // 10 mins in future
      },
    });

    // 4. Order D: expired but has fiat_sent status in DB -> should remain protected/unchanged
    const orderD = await prisma.order.create({
      data: {
        offerId,
        buyerId,
        sellerId,
        assetAmount: 40,
        fiatAmount: 40,
        orderStatus: 'locked',
        expiresAt: new Date(now.getTime() - 10 * 60 * 1000),
      },
    });
    await prisma.escrowOnChain.create({
      data: {
        orderId: orderD.orderId,
        contractId: 'CCONTACTE2EORDERD',
        buyerAddress: 'GBUYERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        sellerAddress: 'GSELLERE2ETESTINGPUBLICKEYFORORDEREXPIRATION12345',
        amount: 40,
        escrowStatus: 'fiat_sent',
      },
    });

    // Mock on-chain balance queries:
    // Order B on-chain balance is 0 (unfunded)
    twServiceMock.getEscrowBalance.mockImplementation((contractId: string) => {
      if (contractId === 'CCONTACTE2EORDERB') {
        return Promise.resolve([{ address: contractId, balance: 0 }]);
      }
      return Promise.resolve([]);
    });

    // Execute expiration logic
    await orderService.expireOrders();

    // Verify on-chain balance was checked for Order B (initialized escrow)
    expect(twServiceMock.getEscrowBalance).toHaveBeenCalledWith(
      'CCONTACTE2EORDERB',
    );

    // Verify on-chain balance was NOT checked for Order D (skipped at DB level due to fiat_sent status)
    expect(twServiceMock.getEscrowBalance).not.toHaveBeenCalledWith(
      'CCONTACTE2EORDERD',
    );

    // Verify order status updates
    const updatedA = await prisma.order.findUnique({
      where: { orderId: orderA.orderId },
    });
    expect(updatedA?.orderStatus).toBe('expired');

    const updatedB = await prisma.order.findUnique({
      where: { orderId: orderB.orderId },
    });
    expect(updatedB?.orderStatus).toBe('cancelled');

    const updatedC = await prisma.order.findUnique({
      where: { orderId: orderC.orderId },
    });
    expect(updatedC?.orderStatus).toBe('created');

    const updatedD = await prisma.order.findUnique({
      where: { orderId: orderD.orderId },
    });
    expect(updatedD?.orderStatus).toBe('locked');

    // Verify escrow records remain unchanged after expiration
    const escrowBAfter = await prisma.escrowOnChain.findUnique({
      where: { escrowId: escrowB.escrowId },
    });
    expect(escrowBAfter?.escrowStatus).toBe('initialized');

    const escrowDAfter = await prisma.escrowOnChain.findFirst({
      where: { orderId: orderD.orderId },
    });
    expect(escrowDAfter?.escrowStatus).toBe('fiat_sent');
  });
});
