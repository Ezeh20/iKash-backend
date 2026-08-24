import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { AppRole } from '../interfaces/app-role.interface';
import { AppException, ErrorCode } from '../errors';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { appUser: { findUnique: jest.Mock } };

  const buildContext = (
    user: { userId?: string; id?: string } | undefined,
  ): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const responseOf = (error: unknown) =>
    (error as AppException).getResponse() as {
      statusCode: number;
      error: ErrorCode;
    };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = { appUser: { findUnique: jest.fn() } };
    guard = new RolesGuard(reflector as never, prisma as never);
  });

  it('allows requests when no @Roles metadata is set', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(buildContext(undefined))).resolves.toBe(
      true,
    );
    expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests with 401 when roles are required', async () => {
    reflector.getAllAndOverride.mockReturnValue([AppRole.support]);

    const error = await guard
      .canActivate(buildContext(undefined))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppException);
    expect(responseOf(error)).toMatchObject({
      statusCode: HttpStatus.UNAUTHORIZED,
      error: ErrorCode.UNAUTHORIZED_ACTION,
    });
    expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
  });

  it('allows a requester whose database role is allowed', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      AppRole.admin,
      AppRole.support,
    ]);
    prisma.appUser.findUnique.mockResolvedValue({ role: AppRole.support });

    await expect(
      guard.canActivate(buildContext({ userId: 'support-1' })),
    ).resolves.toBe(true);
    expect(prisma.appUser.findUnique).toHaveBeenCalledWith({
      where: { userId: 'support-1' },
      select: { role: true },
    });
  });

  it('rejects a requester whose database role is not allowed with 403', async () => {
    reflector.getAllAndOverride.mockReturnValue([AppRole.admin]);
    prisma.appUser.findUnique.mockResolvedValue({ role: AppRole.user });

    const error = await guard
      .canActivate(buildContext({ userId: 'user-1' }))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppException);
    expect(responseOf(error)).toMatchObject({
      statusCode: HttpStatus.FORBIDDEN,
      error: ErrorCode.UNAUTHORIZED_ACTION,
    });
  });

  it('rejects a requester without an AppUser record with 403', async () => {
    reflector.getAllAndOverride.mockReturnValue([AppRole.support]);
    prisma.appUser.findUnique.mockResolvedValue(null);

    const error = await guard
      .canActivate(buildContext({ userId: 'missing-user' }))
      .catch((caught: unknown) => caught);

    expect(responseOf(error)).toMatchObject({
      statusCode: HttpStatus.FORBIDDEN,
      error: ErrorCode.UNAUTHORIZED_ACTION,
    });
  });

  it('supports request.user.id as the authenticated user identifier', async () => {
    reflector.getAllAndOverride.mockReturnValue([AppRole.admin]);
    prisma.appUser.findUnique.mockResolvedValue({ role: AppRole.admin });

    await expect(
      guard.canActivate(buildContext({ id: 'admin-1' })),
    ).resolves.toBe(true);
    expect(prisma.appUser.findUnique).toHaveBeenCalledWith({
      where: { userId: 'admin-1' },
      select: { role: true },
    });
  });
});
