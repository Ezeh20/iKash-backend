import { Injectable } from '@nestjs/common';
import { PaginationDto } from '../../common/pagination.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethodsRepository } from './payment-methods.repository';
import { AppException, ErrorCode } from '../../common/errors';
import { PaymentMethod } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction, AuditResult } from '../audit-log/enums/audit-action.enum';

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly repo: PaymentMethodsRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    const created = (await this.repo.create(
      dto as unknown as Record<string, unknown>,
    )) as PaymentMethod;

    await this.auditLogService.create({
      userId: dto.userId,
      action: AuditAction.PAYMENT_METHOD_CREATED,
      resourceType: 'PaymentMethod',
      resourceId: created.paymentId,
      result: AuditResult.SUCCESS,
    });

    return created;
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

  async update(
    id: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const updated = (await this.repo.update(
      id,
      dto as unknown as Record<string, unknown>,
    )) as PaymentMethod;

    await this.auditLogService.create({
      userId: updated.userId,
      action: AuditAction.PAYMENT_METHOD_UPDATED,
      resourceType: 'PaymentMethod',
      resourceId: id,
      result: AuditResult.SUCCESS,
    });

    return updated;
  }

  async remove(id: string): Promise<PaymentMethod> {
    const removed = (await this.repo.delete(id)) as PaymentMethod;

    await this.auditLogService.create({
      userId: removed.userId,
      action: AuditAction.PAYMENT_METHOD_DELETED,
      resourceType: 'PaymentMethod',
      resourceId: id,
      result: AuditResult.SUCCESS,
    });

    return removed;
  }
}
