import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class ReserveDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) bookId: number;
}

export class ReservationDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: Number }) bookId: number;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: Number }) memberId: number;
  @ApiProperty({ type: String }) memberName: string;
  @ApiProperty({ type: String }) memberNumber: string;
  @ApiProperty({ enum: ['WAITING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED'] }) status: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Plaats in de wachtrij (1 = eerstvolgende); null als niet wachtend',
  })
  position: number | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readyAt: string | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Uiterste ophaaldatum',
  })
  expiresAt: string | null;
}

export class NotificationDto {
  @ApiProperty({ type: Number }) id: number;
  @ApiProperty({ type: String }) type: string;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: String }) body: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
}

export class NotificationListDto {
  @ApiProperty({ type: [NotificationDto] }) items: NotificationDto[];
  @ApiProperty({ type: Number }) unread: number;
}

export class NightlyResultDto {
  @ApiProperty({ type: Number }) reminders: number;
  @ApiProperty({ type: Number }) overdueNotices: number;
  @ApiProperty({ type: Number }) finesUpdated: number;
  @ApiProperty({ type: Number }) reservationsExpired: number;
  @ApiProperty({ type: Number }) membershipNotices: number;
  @ApiProperty({ type: Number, description: 'AVG: verwijderde verouderde records' })
  retentionDeleted: number;
  @ApiProperty({ type: Number, description: 'AVG: geanonimiseerde inactieve leden' })
  membersAnonymized: number;
}
