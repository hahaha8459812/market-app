import { IsIn, IsInt, IsString } from 'class-validator';

export class GrantBalanceDto {
  @IsString()
  charName: string;

  @IsInt()
  amount: number;

  @IsString()
  @IsIn(['personal', 'wallet'])
  target: 'personal' | 'wallet';
}
