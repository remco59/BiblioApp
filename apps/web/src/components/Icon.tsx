/** Lijniconen in één stijl (24×24, 1.7 streek). Altijd decoratief: de tekst ernaast draagt de betekenis. */
const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  books: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 5.5l3.5-1 3 15-3.5 1z',
  library: 'M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  desk: 'M3 10h18M5 10v10M19 10v10M8 6h8l1 4H7z',
  bell: 'M6 17V11a6 6 0 1112 0v6l2 2H4zM10 21h4',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4l9 16H3zM12 10v4M12 17.5v.01',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  dot: 'M12 13.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  retry: 'M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5',
  chevron: 'M9 6l6 6-6 6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, filled = false }: { name: IconName; filled?: boolean }) {
  return (
    <svg className={`icon${filled ? ' filled' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
