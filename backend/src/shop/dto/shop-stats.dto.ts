import { IsOptional, IsString } from 'class-validator';

export class ShopStatsQueryDto {
  @IsOptional()
  @IsString()
  include?: string;
}

