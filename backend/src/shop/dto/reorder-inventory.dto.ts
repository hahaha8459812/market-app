import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class ReorderInventoryDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  inventoryIds!: number[];
}

