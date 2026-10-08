export const GENRES = ['Thriller', 'Roman', 'Fantasy', 'Educatief'] as const;
export type GenreName = (typeof GENRES)[number];

export const COPY_STATUSES = ['AVAILABLE', 'LOANED', 'RESERVED_HOLD', 'LOST', 'DAMAGED'] as const;
export type CopyStatus = (typeof COPY_STATUSES)[number];
