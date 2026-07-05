import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BaseRepository } from '../../common/base.repository';
import { AppUser } from '@prisma/client';

@Injectable()
export class UsersRepository extends BaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.appUser, 'userId');
  }

  // ✅ ESTE método existe SOLO aquí, por eso el service debe inyectar UsersRepository
  findByPublicKey(publicKey: string): Promise<AppUser | null> {
    return this.prisma.appUser.findUnique({
      where: { publicKey },
      include: {
        paymentMethods: {
          include: {
            payment_provider: true,
          },
        },
      },
    });
  }

  findByAlias(alias: string): Promise<AppUser | null> {
    return this.prisma.appUser.findUnique({ where: { alias } });
  }

  async findOrCreateByPublicKey(publicKey: string): Promise<AppUser> {
    const existing = await this.findByPublicKey(publicKey);
    if (existing) return existing;
    return this.create({
      publicKey,
      pendingAccountInfo: true,
    }) as Promise<AppUser>;
  }

  async isAliasAvailable(alias: string): Promise<boolean> {
    const found = await this.prisma.appUser.findUnique({ where: { alias } });
    return found === null;
  }
}
