import type { Bullet } from './gemini';

export type { Bullet, Source } from './gemini';

export type Snapshot = {
  id: string;
  fetched_at: string;
  items: Bullet[];
};

export type Box = {
  id: string;
  topic: string;
  position: number;
  created_at: string;
  snapshots: Snapshot[];
};
