import { IsString, MinLength } from 'class-validator';

export class ChangeUsernameDto {
  @IsString()
  @MinLength(1)
  username: string;
}

