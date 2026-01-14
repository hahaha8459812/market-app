import { IsIn } from 'class-validator';

export class SwitchWalletModeDto {
  @IsIn(['PERSONAL', 'TEAM'])
  mode: 'PERSONAL' | 'TEAM';
}
