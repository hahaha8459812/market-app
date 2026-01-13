import { IsInt, IsString, Min } from 'class-validator';

export class PurchaseDto {
  @IsInt()
  productId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}
