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
  // Najnowsze najpierw: snapshots[0] = "24h", snapshots[1] = "24-48h".
  snapshots: Snapshot[];
};
