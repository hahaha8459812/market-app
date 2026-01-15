import { IsString, MinLength } from 'class-validator';

export class UpdateCurrencyDto {
  @IsString()
  @MinLength(1)
  name: string;
}
