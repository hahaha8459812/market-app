import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateConfigDto {
  @IsOptional()
  @IsBoolean()
  allow_register?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5000)
  ws_ping_interval_ms?: number;
}

