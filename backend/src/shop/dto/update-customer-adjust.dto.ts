import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCustomerAdjustDto {
  @IsOptional()
  @IsBoolean()
  allowCustomerInc?: boolean;

  @IsOptional()
  @IsBoolean()
  allowCustomerDec?: boolean;
}

