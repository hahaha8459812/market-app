import { IsInt } from 'class-validator';

export class SelfAdjustDto {
  @IsInt()
  amount: number;
}

