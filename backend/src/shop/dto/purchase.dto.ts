import { IsInt, IsString, Min } from 'class-validator';

export class PurchaseDto {
  @IsString()
  charName: string;

  @IsInt()
  productId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}
