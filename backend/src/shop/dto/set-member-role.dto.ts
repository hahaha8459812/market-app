import { IsIn, IsInt } from 'class-validator';

export class SetMemberRoleDto {
  @IsInt()
  memberId: number;

  @IsIn(['CLERK', 'CUSTOMER'])
  role: 'CLERK' | 'CUSTOMER';
}

