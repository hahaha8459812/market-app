import { IsString, MinLength } from 'class-validator';

export class SetupAdminDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
