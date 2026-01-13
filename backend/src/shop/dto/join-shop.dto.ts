import { IsString, MinLength } from 'class-validator';

export class JoinShopDto {
  @IsString()
  inviteCode: string;

  @IsString()
  @MinLength(1)
  charName: string;
}

