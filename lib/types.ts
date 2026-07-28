export type Source = { title: string; url: string };

// `foreign` = pozycja z zagranicznego (nie-PL) wydania Google News; ustawia ja silnik RSS
// przy dobieraniu newsow z wydania US dla tematow ubogich w polskie zrodla.
export type Bullet = {
  text: string;
  sources: Source[];
  foreign?: boolean;
  /** Data publikacji zrodla w ISO 8601 (UTC). */
  published?: string;
};

export type Snapshot = {
  id: string;
  fetched_at: string;
  items: Bullet[];
};

export type Box = {
  id: string;
  topic: string;
  // Angielskie haslo wyszukiwania - liczone raz przy dodaniu/edycji tematu i cache'owane,
  // zeby nie placic za tlumaczenie przy kazdym odswiezeniu.
  topic_en?: string | null;
  position: number;
  created_at: string;
  snapshots: Snapshot[];
};
