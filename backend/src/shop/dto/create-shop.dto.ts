import { IsObject, IsString } from 'class-validator';

export class CreateShopDto {
  @IsString()
  name: string;

  @IsObject()
  currencyRules: Record<string, any>;
}
