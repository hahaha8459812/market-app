import { IsInt, IsOptional } from 'class-validator';

export class GrantBalanceDto {
  @IsOptional()
  @IsInt()
  memberId?: number;

  @IsInt()
  currencyId: number;

  @IsInt()
  amount: number;
}
