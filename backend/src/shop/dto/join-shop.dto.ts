import { IsString } from 'class-validator';

export class JoinShopDto {
  @IsString()
  inviteCode: string;
}
