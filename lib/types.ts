import type { Bullet } from './gemini';

export type { Bullet, Source } from './gemini';

export type NewsMethod = 'search' | 'rss';

export type Snapshot = {
  id: string;
  fetched_at: string;
  items: Bullet[];
  method?: NewsMethod;
};

export type Box = {
  id: string;
  topic: string;
  position: number;
  created_at: string;
  snapshots: Snapshot[];
};
