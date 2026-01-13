import { IsInt, IsString } from 'class-validator';

export class AssignWalletDto {
  @IsString()
  charName: string;

  @IsInt()
  walletId: number;
}

