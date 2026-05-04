import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateUserDto } from './dto/create-users.dto';
import { UpdateUserDto } from './dto/update-users.dto';
import { UsersRepository } from './users.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { SetupAccountDto } from './dto/setup-account.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getOrCreateAccount(publicKey: string) {
    return this.repo.findOrCreateByPublicKey(publicKey);
  }

  async isAliasAvailable(alias: string) {
    const available = await this.repo.isAliasAvailable(alias);
    return { available };
  }

  async setupAccount(userId: string, dto: SetupAccountDto) {
    const { bankName, accountHolderName, accountNumber, ...profileData } = dto;
    
    // Update user profile + set pendingAccountInfo = false
    const updated = await this.repo.update(userId, { 
      ...profileData, 
      pendingAccountInfo: false 
    });

    // Create PaymentMethod if bank data provided
    if (bankName || accountNumber) {
      await this.prisma.paymentMethod.create({
        data: {
          userId,
          bankName: bankName ?? 'Unknown',
          accountDetails: `${accountHolderName ?? ''} | ${accountNumber ?? ''}`,
        },
      });
    }

    return updated;
  }

  async create(dto: CreateUserDto) {
    const exists = await this.repo.findByPublicKey(dto.publicKey);
    if (exists) throw new BadRequestException('public_key ya existe');
    return this.repo.create(dto);
  }

  list(p: PaginationDto) {
    return this.repo.findMany({
      skip: p.skip,
      take: p.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('User no encontrado');
    return item;
  }

  update(id: string, dto: UpdateUserDto) {
    const data: any = { ...dto };
    if (dto.kycStatus) data.kycUpdatedAt = new Date();
    return this.repo.update(id, data);
  }

  remove(id: string) {
    return this.repo.delete(id);
  }
}