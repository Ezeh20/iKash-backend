import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AppException, ErrorCode } from '../errors';
import { AppRole } from '../interfaces/app-role.interface';
import { AuthenticatedRequest } from '../../lib/types/auth';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<
      readonly AppRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.userId ?? request.user?.id;

    if (!userId) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED_ACTION,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const requester = await this.prisma.appUser.findUnique({
      where: { userId },
      select: { role: true },
    });

    if (!requester || !requiredRoles.includes(requester.role)) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED_ACTION,
        'You do not have permission to perform this action',
      );
    }

    return true;
  }
}
