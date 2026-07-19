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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KycVerifiedGuard } from '../../common/kyc-verified.guard';
import { ResourceOwnerGuard } from '../../common/guards/resource-owner.guard';
import { ResourceOwner } from '../../common/decorators/resource-owner.decorator';
import { ResourceType } from '../../common/interfaces/resource-owner.interface';

@Controller('orders')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Post()
  @UseGuards(JwtAuthGuard, KycVerifiedGuard)
  create(@Body() dto: CreateOrderDto) {
    return this.service.create(dto);
  }

  @Get()
  list(@Query() p: PaginationDto, @Query() q: any) {
    return this.service.list(p, q);
  }

  @Get('user-stats/:userId')
  getUserStats(@Param('userId') userId: string) {
    return this.service.getUserStats(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, ResourceOwnerGuard)
  @ResourceOwner(ResourceType.ORDER)
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, KycVerifiedGuard, ResourceOwnerGuard)
  @ResourceOwner(ResourceType.ORDER)
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, KycVerifiedGuard, ResourceOwnerGuard)
  @ResourceOwner(ResourceType.ORDER)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
