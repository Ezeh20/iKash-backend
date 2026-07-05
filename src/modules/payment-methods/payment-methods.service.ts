import { Injectable } from '@nestjs/common';
import { PaginationDto } from '../../common/pagination.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethodsRepository } from './payment-methods.repository';
import { AppException, ErrorCode } from '../../common/errors';
import { PaymentMethod } from '@prisma/client';

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly repo: PaymentMethodsRepository) {}

  create(dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    return this.repo.create(
      dto as unknown as Record<string, unknown>,
    ) as Promise<PaymentMethod>;
  }

  list(p: PaginationDto): Promise<PaymentMethod[]> {
    return this.repo.findMany({ skip: p.skip, take: p.take }) as Promise<
      PaymentMethod[]
    >;
  }

  async get(id: string): Promise<PaymentMethod> {
    const item = (await this.repo.findById(id)) as PaymentMethod;
    if (!item) {
      throw new AppException(
        ErrorCode.PAYMENT_METHOD_NOT_FOUND,
        `Payment method ${id} not found`,
      );
    }
    return item;
  }

  update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethod> {
    return this.repo.update(
      id,
      dto as unknown as Record<string, unknown>,
    ) as Promise<PaymentMethod>;
  }

  remove(id: string): Promise<PaymentMethod> {
    return this.repo.delete(id) as Promise<PaymentMethod>;
  }
}
