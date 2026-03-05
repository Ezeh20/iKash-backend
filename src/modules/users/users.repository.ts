import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BaseRepository } from '../../common/base.repository';

@Injectable()
export class UsersRepository extends BaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.appUser, 'userId');
  }

  // ✅ ESTE método existe SOLO aquí, por eso el service debe inyectar UsersRepository
  findByPublicKey(publicKey: string) {
    return this.prisma.appUser.findUnique({ where: { publicKey } });
  }
}