import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EmailTokenType } from '@prisma/client';
import { hash, verify } from '@node-rs/argon2';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUserDto } from './dto';
import { hashToken, newToken } from './tokens';

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 3600 * 1000;

// argon2id is de standaard van @node-rs/argon2
const hashPassword = (pw: string) => hash(pw);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  private get webOrigin() {
    return process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  }

  async register(email: string, name: string, password: string) {
    email = email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('E-mailadres is al in gebruik');
    }
    const passwordHash = await hashPassword(password);
    const user = await this.prisma.$transaction(async (tx) => {
      const count = await tx.member.count();
      const u = await tx.user.create({ data: { email, name, passwordHash } });
      await tx.member.create({
        data: {
          userId: u.id,
          memberNumber: `L${String(100000 + count + 1)}-${u.id}`,
          membershipUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        },
      });
      return u;
    });
    await this.audit.log('auth.register', user.id);
    await this.sendVerification(user.id, user.email);
  }

  private async issueToken(userId: number, type: EmailTokenType, ttl: number) {
    const token = newToken();
    await this.prisma.emailToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttl) },
    });
    return token;
  }

  private async sendVerification(userId: number, email: string) {
    const token = await this.issueToken(userId, 'VERIFY_EMAIL', VERIFY_TTL_MS);
    await this.mail.send({
      to: email,
      subject: 'Bevestig je e-mailadres',
      text: `Welkom bij BiblioApp!\n\nBevestig je e-mailadres via:\n${this.webOrigin}/verify-email?token=${token}\n\nDe link is 24 uur geldig.`,
    });
  }

  private async consumeToken(token: string, type: EmailTokenType) {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException('Ongeldige of verlopen link');
    }
    // Atomisch markeren zodat een token maar één keer werkt.
    const res = await this.prisma.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (res.count !== 1) throw new BadRequestException('Ongeldige of verlopen link');
    return row;
  }

  async verifyEmail(token: string) {
    const row = await this.consumeToken(token, 'VERIFY_EMAIL');
    await this.prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await this.audit.log('auth.verify_email', row.userId);
  }

  async login(email: string, password: string): Promise<{ token: string; user: SessionUserDto }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { member: true },
    });
    const ok = user ? await verify(user.passwordHash, password).catch(() => false) : false;
    if (!user || !ok) {
      await this.audit.log('auth.login_failed', user?.id ?? null);
      throw new UnauthorizedException('Onjuiste inloggegevens');
    }
    if (!user.emailVerifiedAt) throw new ForbiddenException('E-mailadres nog niet bevestigd');
    const token = newToken();
    const csrfToken = newToken();
    await this.prisma.session.create({
      data: {
        id: hashToken(token),
        userId: user.id,
        csrfToken,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    await this.audit.log('auth.login', user.id);
    return { token, user: this.toDto(user, csrfToken) };
  }

  toDto(
    user: {
      id: number;
      email: string;
      name: string;
      role: string;
      locale: string;
      member?: { memberNumber: string } | null;
    },
    csrfToken: string,
  ): SessionUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      locale: user.locale,
      memberNumber: user.member?.memberNumber ?? null,
      csrfToken,
    };
  }

  async logout(sessionId: string, userId: number) {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
    await this.audit.log('auth.logout', userId);
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return; // geen informatie lekken over bestaande accounts
    const token = await this.issueToken(user.id, 'RESET_PASSWORD', RESET_TTL_MS);
    await this.audit.log('auth.forgot_password', user.id);
    await this.mail.send({
      to: user.email,
      subject: 'Wachtwoord opnieuw instellen',
      text: `Stel je wachtwoord opnieuw in via:\n${this.webOrigin}/reset-password?token=${token}\n\nDe link is 1 uur geldig. Heb je dit niet aangevraagd? Negeer dan deze mail.`,
    });
  }

  async resetPassword(token: string, password: string) {
    const row = await this.consumeToken(token, 'RESET_PASSWORD');
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      // Een reset beëindigt alle bestaande sessies.
      this.prisma.session.deleteMany({ where: { userId: row.userId } }),
    ]);
    await this.audit.log('auth.reset_password', row.userId);
  }

  async findSession(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: hashToken(token) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    return session;
  }
}
