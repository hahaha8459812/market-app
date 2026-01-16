import { ArrayNotEmpty, IsArray, IsInt, IsOptional } from 'class-validator';

export class ReorderInventoryDto {
  @IsOptional()
  @IsInt()
  memberId?: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  inventoryIds!: number[];
}
