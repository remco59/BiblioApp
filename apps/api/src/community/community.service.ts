import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { bookInclude, toBookDto } from '../catalog/book-mapper';
import { BookDto } from '../catalog/dto';
import { DomainError } from '../loans/errors';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookReviewsDto, ReviewDto, ReviewSummaryDto, SuggestionDto } from './dto';

const reviewInclude = {
  book: { select: { title: true } },
  user: { select: { name: true } },
} satisfies Prisma.ReviewInclude;
type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

const toReviewDto = (r: ReviewRow): ReviewDto => ({
  id: r.id,
  bookId: r.bookId,
  bookTitle: r.book.title,
  author: r.user.name,
  rating: r.rating,
  body: r.body,
  status: r.status,
  moderationNote: r.moderationNote,
  createdAt: r.createdAt.toISOString(),
});

const STATUS_NL: Record<string, string> = { APPROVED: 'goedgekeurd', REJECTED: 'afgewezen' };
const STATUS_EN: Record<string, string> = { APPROVED: 'approved', REJECTED: 'rejected' };
const SUGGESTION_NL: Record<string, string> = {
  SUBMITTED: 'ingediend',
  APPROVED: 'goedgekeurd',
  REJECTED: 'afgewezen',
  ORDERED: 'besteld',
  ADDED: 'toegevoegd aan de collectie',
};
const SUGGESTION_EN: Record<string, string> = {
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ORDERED: 'ordered',
  ADDED: 'added to the collection',
};

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ---------- reviews ----------

  summarize(ratings: number[]): ReviewSummaryDto {
    const distribution = [1, 2, 3, 4, 5].map((n) => ratings.filter((r) => r === n).length);
    const count = ratings.length;
    return {
      average: count ? Math.round((ratings.reduce((a, b) => a + b, 0) / count) * 10) / 10 : null,
      count,
      distribution,
    };
  }

  async bookReviews(bookId: number, userId?: number): Promise<BookReviewsDto> {
    const approved = await this.prisma.review.findMany({
      where: { bookId, status: 'APPROVED' },
      include: reviewInclude,
      orderBy: { createdAt: 'desc' },
    });
    const mine = userId
      ? await this.prisma.review.findUnique({
          where: { bookId_userId: { bookId, userId } },
          include: reviewInclude,
        })
      : null;
    const canReview = userId ? await this.hasBorrowed(userId, bookId) : false;
    return {
      summary: this.summarize(approved.map((r) => r.rating)),
      items: approved.map(toReviewDto),
      mine: mine ? toReviewDto(mine) : null,
      canReview,
    };
  }

  private async hasBorrowed(userId: number, bookId: number) {
    return !!(await this.prisma.loan.findFirst({
      where: { member: { userId }, copy: { bookId } },
      select: { id: true },
    }));
  }

  /** Alleen leden die het boek hebben geleend mogen reviewen; elke wijziging gaat opnieuw langs moderatie. */
  async saveReview(
    userId: number,
    bookId: number,
    rating: number,
    body?: string,
  ): Promise<ReviewDto> {
    if (!(await this.prisma.book.findUnique({ where: { id: bookId }, select: { id: true } }))) {
      throw new DomainError('Boek niet gevonden', 'BOOK_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (!(await this.hasBorrowed(userId, bookId))) {
      throw new DomainError(
        'Je kunt alleen boeken beoordelen die je hebt geleend',
        'NOT_BORROWED',
        HttpStatus.FORBIDDEN,
      );
    }
    const text = body?.trim() || null;
    const data = {
      rating,
      body: text,
      status: 'PENDING' as const,
      moderationNote: null,
      moderatedById: null,
      moderatedAt: null,
    };
    const r = await this.prisma.review.upsert({
      where: { bookId_userId: { bookId, userId } },
      update: data,
      create: { bookId, userId, ...data },
      include: reviewInclude,
    });
    await this.audit.log('review.save', userId, { reviewId: r.id, bookId });
    return toReviewDto(r);
  }

  async deleteReview(userId: number, bookId: number) {
    const res = await this.prisma.review.deleteMany({ where: { bookId, userId } });
    if (res.count === 0)
      throw new DomainError('Review niet gevonden', 'REVIEW_NOT_FOUND', HttpStatus.NOT_FOUND);
    await this.audit.log('review.delete', userId, { bookId });
  }

  async myReviews(userId: number): Promise<ReviewDto[]> {
    const rows = await this.prisma.review.findMany({
      where: { userId },
      include: reviewInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toReviewDto);
  }

  async moderationQueue(
    status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING',
  ): Promise<ReviewDto[]> {
    const rows = await this.prisma.review.findMany({
      where: { status },
      include: reviewInclude,
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map(toReviewDto);
  }

  async moderate(
    id: number,
    status: 'APPROVED' | 'REJECTED',
    note: string | undefined,
    staffId: number,
  ): Promise<ReviewDto> {
    const existing = await this.prisma.review.findUnique({
      where: { id },
      include: { user: { select: { locale: true } }, book: { select: { title: true } } },
    });
    if (!existing)
      throw new DomainError('Review niet gevonden', 'REVIEW_NOT_FOUND', HttpStatus.NOT_FOUND);
    const n = await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id },
        data: {
          status,
          moderationNote: note?.trim() || null,
          moderatedById: staffId,
          moderatedAt: new Date(),
        },
      });
      const label = (existing.user.locale === 'en' ? STATUS_EN : STATUS_NL)[status]!;
      return this.notifications.create(tx, existing.userId, 'REVIEW_MODERATED', {
        title: existing.book.title,
        status: label,
        note: note?.trim() || undefined,
        bookId: existing.bookId,
      });
    });
    await this.notifications.dispatch([n]);
    await this.audit.log('review.moderate', staffId, { reviewId: id, status });
    return toReviewDto(
      await this.prisma.review.findUniqueOrThrow({ where: { id }, include: reviewInclude }),
    );
  }

  // ---------- verlanglijst ----------

  async wishlist(userId: number): Promise<BookDto[]> {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      include: { book: { include: bookInclude } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((i) => toBookDto(i.book));
  }

  async wishlistIds(userId: number): Promise<number[]> {
    return (
      await this.prisma.wishlistItem.findMany({ where: { userId }, select: { bookId: true } })
    ).map((i) => i.bookId);
  }

  async addToWishlist(userId: number, bookId: number) {
    if (!(await this.prisma.book.findUnique({ where: { id: bookId }, select: { id: true } }))) {
      throw new DomainError('Boek niet gevonden', 'BOOK_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.prisma.wishlistItem.upsert({
      where: { userId_bookId: { userId, bookId } },
      update: {},
      create: { userId, bookId },
    });
  }

  async removeFromWishlist(userId: number, bookId: number) {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, bookId } });
  }

  /**
   * Meldt wensenlijst-bezitters dat het boek beschikbaar is. Alleen als er echt een exemplaar vrij is,
   * niet voor leden die het al lenen, en niet opnieuw zolang de vorige melding ongelezen is.
   */
  async notifyWishlistAvailable(bookId: number, skipUserIds: number[] = []): Promise<void> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { title: true },
    });
    if (!book || (await this.prisma.copy.count({ where: { bookId, status: 'AVAILABLE' } })) === 0)
      return;
    const wishers = await this.prisma.wishlistItem.findMany({
      where: {
        bookId,
        userId: { notIn: skipUserIds },
        user: { member: { loans: { none: { returnedAt: null, copy: { bookId } } } } },
      },
      select: { userId: true },
    });
    for (const { userId } of wishers) {
      const dupe = await this.prisma.notification.findFirst({
        where: {
          userId,
          type: 'WISHLIST_AVAILABLE',
          readAt: null,
          data: { path: ['bookId'], equals: bookId },
        },
        select: { id: true },
      });
      if (dupe) continue;
      const n = await this.prisma.$transaction((tx) =>
        this.notifications.create(tx, userId, 'WISHLIST_AVAILABLE', { title: book.title, bookId }),
      );
      await this.notifications.dispatch([n]);
    }
  }

  // ---------- aankoopsuggesties ----------

  private toSuggestion(
    s: Prisma.SuggestionGetPayload<{ include: { user: { select: { name: true } } } }>,
  ): SuggestionDto {
    return {
      id: s.id,
      title: s.title,
      author: s.author,
      isbn: s.isbn,
      reason: s.reason,
      status: s.status,
      staffNote: s.staffNote,
      memberName: s.user.name,
      createdAt: s.createdAt.toISOString(),
    };
  }

  async suggest(
    userId: number,
    input: { title: string; author: string; isbn?: string; reason?: string },
  ): Promise<SuggestionDto> {
    const open = await this.prisma.suggestion.count({ where: { userId, status: 'SUBMITTED' } });
    if (open >= 10)
      throw new DomainError(
        'Je hebt al 10 suggesties in behandeling',
        'SUGGESTION_LIMIT',
        HttpStatus.FORBIDDEN,
      );
    const dupe = await this.prisma.suggestion.findFirst({
      where: {
        userId,
        title: { equals: input.title.trim(), mode: 'insensitive' },
        author: { equals: input.author.trim(), mode: 'insensitive' },
        status: { in: ['SUBMITTED', 'APPROVED', 'ORDERED'] },
      },
    });
    if (dupe) throw new DomainError('Je hebt dit boek al voorgesteld', 'SUGGESTION_DUPLICATE');
    const s = await this.prisma.suggestion.create({
      data: {
        userId,
        title: input.title.trim(),
        author: input.author.trim(),
        isbn: input.isbn?.replace(/[\s-]/g, '') || null,
        reason: input.reason?.trim() || null,
      },
      include: { user: { select: { name: true } } },
    });
    await this.audit.log('suggestion.create', userId, { suggestionId: s.id });
    return this.toSuggestion(s);
  }

  async mySuggestions(userId: number): Promise<SuggestionDto[]> {
    const rows = await this.prisma.suggestion.findMany({
      where: { userId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((s) => this.toSuggestion(s));
  }

  async allSuggestions(status?: string): Promise<SuggestionDto[]> {
    const rows = await this.prisma.suggestion.findMany({
      where: status ? { status: status as never } : undefined,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
    return rows.map((s) => this.toSuggestion(s));
  }

  async handleSuggestion(
    id: number,
    status: string,
    note: string | undefined,
    staffId: number,
  ): Promise<SuggestionDto> {
    const existing = await this.prisma.suggestion.findUnique({
      where: { id },
      include: { user: { select: { locale: true, name: true } } },
    });
    if (!existing)
      throw new DomainError(
        'Suggestie niet gevonden',
        'SUGGESTION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    const changed = existing.status !== status;
    const n = await this.prisma.$transaction(async (tx) => {
      await tx.suggestion.update({
        where: { id },
        data: { status: status as never, staffNote: note?.trim() || null, handledById: staffId },
      });
      if (!changed) return null;
      const label = (existing.user.locale === 'en' ? SUGGESTION_EN : SUGGESTION_NL)[status]!;
      return this.notifications.create(tx, existing.userId, 'SUGGESTION_UPDATED', {
        title: existing.title,
        status: label,
        note: note?.trim() || undefined,
      });
    });
    if (n) await this.notifications.dispatch([n]);
    await this.audit.log('suggestion.handle', staffId, { suggestionId: id, status });
    return this.toSuggestion(
      await this.prisma.suggestion.findUniqueOrThrow({
        where: { id },
        include: { user: { select: { name: true } } },
      }),
    );
  }
}
