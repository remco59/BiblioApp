import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';

export type AppEvent =
  | { type: 'availability'; bookId: number }
  | { type: 'notification'; userId: number; notificationId: number; title: string };

/** In-memory pub/sub voor Server-Sent Events (per proces). */
@Injectable()
export class EventsService {
  private readonly bus = new Subject<AppEvent>();

  emit(event: AppEvent) {
    this.bus.next(event);
  }

  /** Beschikbaarheid gaat naar iedereen; meldingen alleen naar de eigenaar. */
  stream(
    userId: number | undefined,
    heartbeatMs = 25_000,
  ): Observable<{ type: string; data: object }> {
    const events = this.bus.pipe(
      filter((e) => e.type === 'availability' || e.userId === userId),
      map((e) => ({
        type: e.type,
        data:
          e.type === 'availability'
            ? { bookId: e.bookId }
            : { id: e.notificationId, title: e.title },
      })),
    );
    const beat = interval(heartbeatMs).pipe(map(() => ({ type: 'ping', data: {} })));
    return merge(events, beat);
  }
}
