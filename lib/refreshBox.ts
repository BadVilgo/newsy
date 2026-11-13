import type { SupabaseClient } from '@supabase/supabase-js';
import type { Bullet, Snapshot } from './types';
import { fetchRssBullets, type EngineMemory, type PreviousItem } from './rssEngine';

/**
 * Jedno miejsce z logiką odświeżenia boxa - używane przez codzienny skrypt (GitHub Actions),
 * endpoint cron i ręczne odświeżenie z UI. Wcześniej te trzy ścieżki powielały ten sam kod.
 */

// Snapshoty zapisujemy z metodą 'rss' (silnik w Pythonie). Stare wpisy z wycofanego
// wariantu (grounding, method='search') zostają w bazie, ale ich nie czytamy.
export const METHOD = 'rss';

/**
 * Za „poprzedni dzień" uznajemy najnowszy snapshot starszy niż 6 godzin. Próg odróżnia dwie
 * sytuacje: ponowienie tuż po odświeżeniu (retry crona, drugi klik) ma dać ten sam rodzaj
 * wyniku co pierwsze podejście, a odświeżenie po wielu godzinach - pokazać to, co doszło.
 */
export const MEMORY_MIN_AGE_MS = 6 * 60 * 60 * 1000;

type SnapshotRow = { fetched_at: string; items: Bullet[] | null };

export type RefreshableBox = { id: string; topic: string; topic_en?: string | null };

export type RefreshOutcome =
  | { status: 'refreshed'; snapshot: Snapshot }
  /** Od poprzedniego snapshotu nie doszło nic nowego - model nie był wołany. */
  | { status: 'unchanged' };

/**
 * Z historii snapshotów (od najnowszego) buduje pamięć dla silnika.
 * `skipIfUnchanged` dokłada czas najnowszego snapshotu - wtedy silnik może zakończyć bez
 * wołania Gemini, jeśli od tego momentu nic się nie pojawiło.
 */
export function buildMemory(
  snapshots: SnapshotRow[],
  { skipIfUnchanged, now = Date.now() }: { skipIfUnchanged: boolean; now?: number },
): EngineMemory {
  const remembered = snapshots.find(
    (snap) => now - new Date(snap.fetched_at).getTime() >= MEMORY_MIN_AGE_MS,
  );

  const previous: PreviousItem[] = (remembered?.items ?? [])
    .filter((item) => item?.text)
    .map((item) => ({
      text: item.text,
      urls: (item.sources ?? []).map((source) => source.url).filter(Boolean),
    }));

  return {
    previous,
    since: skipIfUnchanged && snapshots.length > 0 ? snapshots[0].fetched_at : null,
  };
}

export async function refreshBoxNews(
  supabase: SupabaseClient,
  box: RefreshableBox,
  { skipIfUnchanged }: { skipIfUnchanged: boolean },
): Promise<RefreshOutcome> {
  // Pamięć jest dodatkiem: gdy nie uda się jej wczytać, odświeżamy tak jak dawniej.
  const { data: history } = await supabase
    .from('snapshots')
    .select('fetched_at, items')
    .eq('box_id', box.id)
    .eq('method', METHOD)
    .order('fetched_at', { ascending: false })
    .limit(5);

  const memory = buildMemory((history ?? []) as SnapshotRow[], { skipIfUnchanged });
  const { bullets, topicEn, unchanged } = await fetchRssBullets(box.topic, box.topic_en, memory);

  // Tłumaczenie policzone przez silnik zapisujemy w cache, żeby nie liczyć go ponownie.
  if (topicEn && topicEn !== box.topic_en) {
    await supabase.from('boxes').update({ topic_en: topicEn }).eq('id', box.id);
  }

  if (unchanged) return { status: 'unchanged' };

  const { data: snapshot, error } = await supabase
    .from('snapshots')
    .insert({ box_id: box.id, items: bullets, method: METHOD })
    .select('id, fetched_at, items')
    .single();

  if (error) throw new Error(`Zapis do bazy nieudany: ${error.message}`);
  return { status: 'refreshed', snapshot: snapshot as Snapshot };
}
