import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateConfigDto {
  @IsOptional()
  @IsBoolean()
  allow_register?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  logs_shared_limit?: number;

  @IsOptional()
  @IsInt()
  @Min(5000)
  ws_ping_interval_ms?: number;
}
