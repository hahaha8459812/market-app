import { IsInt, IsString, MinLength } from 'class-validator';

export class SelfInventoryAdjustDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsInt()
  quantityDelta: number;
}
