import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '../auth';

type Handler = (data: Record<string, unknown>) => void;
interface Bus {
  on(type: string, handler: Handler): () => void;
}

const BusContext = createContext<Bus | null>(null);
const TYPES = ['availability', 'notification'];

/** Eén EventSource-verbinding (Server-Sent Events); opnieuw geopend bij in-/uitloggen. */
export function EventsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const handlers = useRef(new Map<string, Set<Handler>>());
  const bus = useRef<Bus>({
    on(type, handler) {
      const set = handlers.current.get(type) ?? new Set<Handler>();
      set.add(handler);
      handlers.current.set(type, set);
      return () => set.delete(handler);
    },
  });

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events', { withCredentials: true });
    for (const type of TYPES) {
      source.addEventListener(type, (e) => {
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse((e as MessageEvent).data);
        } catch {
          /* negeer onleesbare events */
        }
        handlers.current.get(type)?.forEach((h) => h(data));
      });
    }
    return () => source.close();
  }, [user?.id]);

  return <BusContext.Provider value={bus.current}>{children}</BusContext.Provider>;
}

/** Roept `handler` aan bij elk server-event van dit type. */
export function useServerEvent(type: 'availability' | 'notification', handler: Handler) {
  const bus = useContext(BusContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => bus?.on(type, (d) => latest.current(d)), [bus, type]);
}
