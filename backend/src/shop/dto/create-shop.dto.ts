import { IsOptional, IsObject, IsString } from 'class-validator';

export class CreateShopDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsObject()
  currencyRules?: Record<string, any>;
}
