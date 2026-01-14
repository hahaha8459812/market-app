import { IsInt, IsOptional } from 'class-validator';

export class AssignWalletDto {
  @IsInt()
  memberId: number;

  @IsOptional()
  @IsInt()
  walletId?: number | null;
}
