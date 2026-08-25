import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { Roles } from '../decorators/roles.decorator';
import { HttpExceptionFilter } from '../errors';
import { AppRole } from '../interfaces/app-role.interface';
import { RolesGuard } from './roles.guard';

@Controller('roles')
@UseGuards(RolesGuard)
class TestRolesController {
  @Get('public')
  getPublic() {
    return { access: 'public' };
  }

  @Get('support')
  @Roles(AppRole.support)
  getSupport() {
    return { access: 'support' };
  }

  @Get('admin')
  @Roles(AppRole.admin)
  getAdmin() {
    return { access: 'admin' };
  }
}

describe('RolesGuard (integration)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: { appUser: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { appUser: { findUnique: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      controllers: [TestRolesController],
      providers: [
        Reflector,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.use(
      (
        req: { headers: Record<string, string | undefined>; user?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        const userId = req.headers['x-user-id'];
        if (userId) {
          req.user = { userId };
        }
        next();
      },
    );

    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows routes without @Roles metadata without querying the database', async () => {
    await request(server).get('/roles/public').expect(200, {
      access: 'public',
    });
    expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 UNAUTHORIZED_ACTION when no user is authenticated', async () => {
    await request(server).get('/roles/support').expect(401, {
      statusCode: 401,
      error: 'UNAUTHORIZED_ACTION',
      message: 'Authentication required',
    });
    expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 UNAUTHORIZED_ACTION when the role is not allowed', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: AppRole.user });

    await request(server)
      .get('/roles/support')
      .set('x-user-id', 'user-1')
      .expect(403, {
        statusCode: 403,
        error: 'UNAUTHORIZED_ACTION',
        message: 'You do not have permission to perform this action',
      });
  });

  it('allows a requester whose database role matches @Roles', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: AppRole.support });

    await request(server)
      .get('/roles/support')
      .set('x-user-id', 'support-1')
      .expect(200, { access: 'support' });
    expect(prisma.appUser.findUnique).toHaveBeenCalledWith({
      where: { userId: 'support-1' },
      select: { role: true },
    });
  });

  it('does not allow one privileged role to satisfy a different role', async () => {
    prisma.appUser.findUnique.mockResolvedValue({ role: AppRole.support });

    await request(server)
      .get('/roles/admin')
      .set('x-user-id', 'support-1')
      .expect(403);
  });
});
