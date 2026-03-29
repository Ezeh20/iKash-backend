import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { UpdateEscrowDto } from './dto/update-escrow.dto';
import { InitializeEscrowDto } from './dto/initialize-escrow.dto';
import { FundEscrowDto } from './dto/fund-escrow.dto';
import { ReleaseEscrowDto } from './dto/release-escrow.dto';
import { SyncEscrowDto } from './dto/sync-escrow.dto';
import { EscrowService } from './escrow.service';

@Controller('escrows')
export class EscrowController {
  constructor(private readonly service: EscrowService) {}

  // ─── Trustless Work Escrow Flow ──────────────────────────────────────

  /** Get unsigned XDR to deploy a new escrow contract */
  @Post('initialize')
  initialize(@Body() dto: InitializeEscrowDto) {
    return this.service.initialize(dto);
  }

  /** Get unsigned XDR to fund an existing escrow */
  @Post('fund')
  fund(@Body() dto: FundEscrowDto) {
    return this.service.fund(dto);
  }

  /** Get unsigned XDR to release escrow funds */
  @Post('release')
  release(@Body() dto: ReleaseEscrowDto) {
    return this.service.release(dto);
  }

  /** Submit signed XDR and update DB status */
  @Post('sync')
  sync(@Body() dto: SyncEscrowDto) {
    return this.service.syncTransaction(dto);
  }

  /** Mark that the buyer has sent fiat payment */
  @Post(':id/fiat-sent')
  markFiatSent(@Param('id') id: string) {
    return this.service.markFiatSent(id);
  }

  /** Get escrow status with live on-chain data */
  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.service.getStatus(id);
  }

  // ─── Legacy CRUD ─────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateEscrowDto) {
    return this.service.create(dto);
  }

  @Get()
  list(@Query() p: PaginationDto, @Query('orderId') orderId?: string) {
    return this.service.list(p, orderId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEscrowDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}