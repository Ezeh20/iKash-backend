import { IsOptional, IsString, IsIn } from 'class-validator';

export class StatsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['7d', '2s', '1m', 'all'])
  window?: string = '7d';
}
