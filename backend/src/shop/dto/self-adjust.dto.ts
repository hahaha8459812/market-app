import { IsInt } from 'class-validator';

export class SelfAdjustDto {
  @IsInt()
  currencyId: number;

  @IsInt()
  amount: number;
}
