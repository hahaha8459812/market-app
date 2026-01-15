import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RenameInventoryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  memberId?: number;

  @IsString()
  oldName!: string;

  @IsString()
  newName!: string;
}

