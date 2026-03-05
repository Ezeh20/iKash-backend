export type FindManyArgs = {
  skip?: number;
  take?: number;
  where?: any;
  orderBy?: any;
};

export class BaseRepository {
  constructor(
    protected readonly model: any,
    private readonly idKey: string, // ej: 'userId', 'paymentId', ...
  ) {}

  create(data: any) {
    return this.model.create({ data });
  }

  findById(id: string) {
    return this.model.findUnique({ where: { [this.idKey]: id } });
  }

  findMany(args: FindManyArgs = {}) {
    const { skip = 0, take = 20, where = {}, orderBy = {} } = args;
    return this.model.findMany({ skip, take, where, orderBy });
  }

  update(id: string, data: any) {
    return this.model.update({ where: { [this.idKey]: id }, data });
  }

  delete(id: string) {
    return this.model.delete({ where: { [this.idKey]: id } });
  }
}