import { IsBoolean } from 'class-validator';

export class DeleteCurrencyDto {
  @IsBoolean()
  confirm: boolean;
}
