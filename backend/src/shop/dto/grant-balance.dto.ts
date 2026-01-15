import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class GrantBalanceDto {
  @IsOptional()
  @IsInt()
  memberId?: number;

  @IsInt()
  currencyId: number;

  @IsInt()
  amount: number;

  @IsString()
  @IsIn(['personal', 'team'])
  target: 'personal' | 'team';
}
