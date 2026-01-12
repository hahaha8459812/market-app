import { IsInt, IsString } from 'class-validator';

export class GrantBalanceDto {
  @IsString()
  charName: string;

  @IsInt()
  amount: number;
}
