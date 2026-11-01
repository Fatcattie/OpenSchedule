import { IsEmail, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';

export const PERSONNEL_ROLES = ['super_admin', 'admin', 'member'] as const;
export type PersonnelRole = (typeof PERSONNEL_ROLES)[number];

export class CreatePersonnelDto {
  @IsEmail()
  @Length(3, 320)
  email!: string;

  @IsString()
  @Length(1, 120)
  displayName!: string;

  @IsIn(PERSONNEL_ROLES)
  role!: PersonnelRole;

  @IsString()
  @MinLength(12)
  @Length(12, 256)
  password!: string;
}

export class UpdatePersonnelDto {
  @IsOptional()
  @IsEmail()
  @Length(3, 320)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsOptional()
  @IsIn(PERSONNEL_ROLES)
  role?: PersonnelRole;
}

export class SetPersonnelStatusDto {
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled';
}

export class PersonnelListQueryDto {
  @IsOptional()
  @IsIn(PERSONNEL_ROLES)
  role?: PersonnelRole;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';

  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}
