import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const SETTING_DEFAULTS = {
  loanDays: 21,
  maxRenewals: 2,
  renewalDays: 21,
  maxLoansPerMember: 5,
  finePerDayCents: 25,
  fineCapCents: 1500,
  blockFinesThresholdCents: 500,
  lostFeeCents: 2500,
  damagedFeeCents: 500,
  membershipMonths: 12,
} as const;

export type Settings = { -readonly [K in keyof typeof SETTING_DEFAULTS]: number };
export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as (keyof Settings)[];

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(db: Db = this.prisma): Promise<Settings> {
    const rows = await db.setting.findMany();
    const out: Settings = { ...SETTING_DEFAULTS };
    for (const r of rows) {
      if (r.key in out && typeof r.value === 'number') out[r.key as keyof Settings] = r.value;
    }
    return out;
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    await this.prisma.$transaction(
      Object.entries(patch)
        .filter(([k, v]) => k in SETTING_DEFAULTS && typeof v === 'number')
        .map(([key, value]) =>
          this.prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } }),
        ),
    );
    return this.getAll();
  }
}
