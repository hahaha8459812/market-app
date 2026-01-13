import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateShopDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsObject()
  currencyRules?: Record<string, any>;
}

