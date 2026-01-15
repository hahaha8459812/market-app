import { IsString, MinLength } from 'class-validator';

export class CreateCurrencyDto {
  @IsString()
  @MinLength(1)
  name: string;
}
