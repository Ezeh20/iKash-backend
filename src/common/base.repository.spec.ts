import { BaseRepository } from './base.repository';

describe('BaseRepository.findMany', () => {
  const model = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const repo = new BaseRepository(model, 'userId');

  beforeEach(() => {
    jest.clearAllMocks();
    model.findMany.mockResolvedValue([]);
  });

  it('applies pagination defaults and sends neither include nor select', async () => {
    await repo.findMany();

    expect(model.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 20,
      where: {},
      orderBy: {},
    });
  });

  it('passes include through to Prisma', async () => {
    const include = { paymentMethods: true };

    await repo.findMany({ take: 5, include });

    expect(model.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 5,
      where: {},
      orderBy: {},
      include,
    });
  });

  it('passes select through to Prisma', async () => {
    const select = { userId: true, alias: true };

    await repo.findMany({
      skip: 10,
      take: 10,
      where: { alias: 'ana' },
      orderBy: { createdAt: 'desc' },
      select,
    });

    expect(model.findMany).toHaveBeenCalledWith({
      skip: 10,
      take: 10,
      where: { alias: 'ana' },
      orderBy: { createdAt: 'desc' },
      select,
    });
  });

  it('rejects include and select together instead of letting Prisma throw', () => {
    expect(() =>
      repo.findMany({ include: { offers: true }, select: { userId: true } }),
    ).toThrow(/cannot be used together/);
    expect(model.findMany).not.toHaveBeenCalled();
  });
});
