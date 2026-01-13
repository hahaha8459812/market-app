import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class AdjustInventoryDto {
  @IsInt()
  memberId: number;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  extraDesc?: string;

  @IsInt()
  quantityDelta: number;
}

