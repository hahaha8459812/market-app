import { IsString, MinLength } from 'class-validator';

export class UpdateCharNameDto {
  @IsString()
  @MinLength(1)
  charName: string;
}

