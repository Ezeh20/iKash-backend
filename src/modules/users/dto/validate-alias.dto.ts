import { IsString, Matches, MaxLength } from 'class-validator';

export class ValidateAliasDto {
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9.!_]+$/, { message: 'Alias must only contain lowercase letters, numbers, and allowed symbols (., !, _)' })
  alias: string;
}
