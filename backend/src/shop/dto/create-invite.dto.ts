import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateInviteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  ttlMinutes?: number; // default 10
}
