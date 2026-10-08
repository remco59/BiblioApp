import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(action: string, userId: number | null, detail?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({ data: { action, userId, detail } });
  }
}
