import { IsInt } from 'class-validator';

export class AssignWalletDto {
  @IsInt()
  memberId: number;

  @IsInt()
  walletId: number;
}
