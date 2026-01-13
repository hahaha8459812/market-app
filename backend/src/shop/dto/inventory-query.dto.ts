import { IsInt, IsOptional } from 'class-validator';

export class InventoryQueryDto {
  @IsOptional()
  @IsInt()
  memberId?: number;
}

