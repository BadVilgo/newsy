'use client';

import { useRef, useState } from 'react';
import type { Snapshot } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import NewsSection from './NewsSection';

type Tab = 'recent' | 'previous';

/**
 * Wspólna część kafelka: czas ostatniego odświeżenia, zakładki „Najnowsze / Poprzednie"
 * i lista newsów. Używana przez edytowalny kafelek na tablicy i przez podgląd tylko do odczytu.
 */
export default function BoxNews({
  snapshots,
  refreshing = false,
  emptyHint,
  children,
}: {
  snapshots: Snapshot[];
  /** Trwa odświeżanie - lista przygasa do czasu odpowiedzi serwera. */
  refreshing?: boolean;
  emptyHint?: string;
  /** Wstawiane między czasem a zakładkami (np. baner błędu odświeżania). */
  children?: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('recent');

  const recent = snapshots[0];
  const shown = activeTab === 'recent' ? recent : snapshots[1];
  const fetchedAt = recent ? formatDateTime(recent.fetched_at) : null;

  // Lista wjeżdża płynnie przy zmianie zakładki i po odświeżeniu (nowy snapshot), ale NIE
  // przy pierwszym renderze - treść prerenderowana na serwerze ma być widoczna od razu.
  const panelKey = `${activeTab}:${shown?.id ?? 'brak'}`;
  const lastKey = useRef(panelKey);
  const changed = useRef(false);
  if (lastKey.current !== panelKey) {
    lastKey.current = panelKey;
    changed.current = true;
  }

  return (
    <>
      {fetchedAt && (
        <p className="timestamp">
          <time dateTime={recent.fetched_at}>{fetchedAt}</time>
        </p>
      )}

      {children}

      <div className="tabs" role="tablist" aria-label="Zakres czasu">
        {(['recent', 'previous'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`tab${activeTab === tab ? ' tab-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'recent' ? 'Najnowsze' : 'Poprzednie'}
          </button>
        ))}
      </div>

      <div
        key={panelKey}
        role="tabpanel"
        aria-label={activeTab === 'recent' ? 'Najnowsze' : 'Poprzednie'}
        aria-busy={refreshing || undefined}
        className={`news-panel${changed.current ? ' news-fade' : ''}${refreshing ? ' is-refreshing' : ''}`}
      >
        <NewsSection snapshot={shown} emptyHint={emptyHint} />
      </div>
    </>
  );
}
