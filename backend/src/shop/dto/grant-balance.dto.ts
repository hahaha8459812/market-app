import { IsIn, IsInt, IsString } from 'class-validator';

export class GrantBalanceDto {
  @IsInt()
  memberId: number;

  @IsInt()
  amount: number;

  @IsString()
  @IsIn(['personal', 'wallet'])
  target: 'personal' | 'wallet';
}
