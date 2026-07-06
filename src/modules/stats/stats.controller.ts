import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsQueryDto } from './dto/stats-query.dto';

@Controller('stats')
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Get()
  getStats(@Query() query: StatsQueryDto) {
    return this.service.getStats(query);
  }
}
