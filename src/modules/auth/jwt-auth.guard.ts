import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

interface RequestWithUser {
  user?: { userId: string; publicKey: string };
  params?: { id?: string };
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    if (process.env.MOCK_PROFILE_UPLOAD === 'true') {
      const request = context.switchToHttp().getRequest<RequestWithUser>();
      request.user = {
        userId: request.params?.id ?? 'mock-user',
        publicKey: 'mock-public-key',
      };
      return true;
    }

    return super.canActivate(context) as boolean | Promise<boolean>;
  }
}
