export type FindManyArgs = {
  skip?: number;
  take?: number;
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
};

interface PrismaCrudModel {
  create: (args: {
    data: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  findUnique: (args: {
    where: Record<string, unknown>;
  }) => Promise<Record<string, unknown> | null>;
  findMany: (args: {
    skip?: number;
    take?: number;
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
  }) => Promise<Record<string, unknown>[]>;
  update: (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  delete: (args: {
    where: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
}

export class BaseRepository {
  constructor(
    protected readonly model: PrismaCrudModel,
    private readonly idKey: string,
  ) {}

  create(data: Record<string, unknown>): Promise<unknown> {
    return this.model.create({ data }) as Promise<unknown>;
  }

  findById(id: string): Promise<unknown> {
    return this.model.findUnique({
      where: { [this.idKey]: id } as Record<string, unknown>,
    }) as Promise<unknown>;
  }

  findMany(args: FindManyArgs = {}): Promise<unknown[]> {
    const { skip = 0, take = 20, where = {}, orderBy = {} } = args;
    return this.model.findMany({ skip, take, where, orderBy }) as Promise<
      unknown[]
    >;
  }

  update(id: string, data: Record<string, unknown>): Promise<unknown> {
    return this.model.update({
      where: { [this.idKey]: id } as Record<string, unknown>,
      data,
    }) as Promise<unknown>;
  }

  delete(id: string): Promise<unknown> {
    return this.model.delete({
      where: { [this.idKey]: id } as Record<string, unknown>,
    }) as Promise<unknown>;
  }
}
