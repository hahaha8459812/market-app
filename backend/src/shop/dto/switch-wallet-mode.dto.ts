import { IsIn, IsInt } from 'class-validator';

export class SwitchWalletModeDto {
  @IsInt()
  walletId: number;

  @IsIn(['PERSONAL', 'TEAM'])
  mode: 'PERSONAL' | 'TEAM';
}

