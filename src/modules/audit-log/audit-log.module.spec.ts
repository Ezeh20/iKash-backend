import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogModule } from './audit-log.module';
import { AuditLogService } from './audit-log.service';
import { AuditLogRepository } from './audit-log.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditAction, AuditResult } from './enums/audit-action.enum';

describe('AuditLogModule (integration)', () => {
  let moduleRef: TestingModule;
  let service: AuditLogService;
  let prismaCreate: jest.Mock;

  beforeEach(async () => {
    prismaCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });

    moduleRef = await Test.createTestingModule({
      imports: [AuditLogModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ auditLog: { create: prismaCreate, findMany: jest.fn() } })
      .compile();

    service = moduleRef.get<AuditLogService>(AuditLogService);
  });

  it('resolves AuditLogService with a working AuditLogRepository wired through the real DI graph', async () => {
    await service.create({
      userId: 'user-1',
      action: AuditAction.DISPUTE_OPENED,
      resourceType: 'Order',
      resourceId: 'order-1',
      result: AuditResult.SUCCESS,
    });

    expect(prismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        action: AuditAction.DISPUTE_OPENED,
        resourceType: 'Order',
        resourceId: 'order-1',
        result: AuditResult.SUCCESS,
      }),
    });
  });

  it('exports AuditLogService for injection by other modules', () => {
    expect(moduleRef.get(AuditLogRepository)).toBeDefined();
    expect(service).toBeInstanceOf(AuditLogService);
  });
});