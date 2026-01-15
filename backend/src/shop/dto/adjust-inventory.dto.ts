import { IsInt, IsString, MinLength } from 'class-validator';

export class AdjustInventoryDto {
  @IsInt()
  memberId: number;

  @IsString()
  @MinLength(1)
  name: string;

  @IsInt()
  quantityDelta: number;
}
