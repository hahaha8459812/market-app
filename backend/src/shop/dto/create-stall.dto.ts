import { IsOptional, IsString } from 'class-validator';

export class CreateStallDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
