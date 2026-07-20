import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderService } from './order.service';
import type { OrderFilter } from './order.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KycVerifiedGuard } from '../../common/kyc-verified.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('orders')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Post()
  @UseGuards(JwtAuthGuard, KycVerifiedGuard)
  create(@Body() dto: CreateOrderDto) {
    return this.service.create(dto);
  }

  @Get()
  list(@Query() p: PaginationDto, @Query() q: OrderFilter) {
    return this.service.list(p, q);
  }

  @Get('user-stats/:userId')
  getUserStats(@Param('userId') userId: string) {
    return this.service.getUserStats(userId);
  }

  // Intentionally guarded with JwtAuthGuard only, not KycVerifiedGuard:
  // cancelling an order the user is already in does not move new funds,
  // so it must not be blocked behind KYC completion.
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; publicKey: string },
  ) {
    return this.service.cancel(id, user.userId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, KycVerifiedGuard)
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, KycVerifiedGuard)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
