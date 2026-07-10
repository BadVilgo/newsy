'use client';

import { useState } from 'react';
import type { Box as BoxType } from '@/lib/types';
import NewsSection from './NewsSection';
import {
  EditIcon,
  RefreshIcon,
  TrashIcon,
  CheckIcon,
  GripIcon,
  AlertIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from './icons';

const ACCENTS = ['#3fb6a8', '#e2554f', '#5aa9f0', '#e0a83f', '#9b8cff', '#4fbf7b'];

function accentFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

export default function BoxCard({
  box,
  onDelete,
  onEdit,
  onRefresh,
  onDragHandleDown,
  onMove,
  isFirst,
  isLast,
}: {
  box: BoxType;
  onDelete: (id: string) => void;
  onEdit: (id: string, topic: string) => Promise<void>;
  onRefresh: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onDragHandleDown: () => void;
  onMove: (id: string, dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(box.topic);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'recent' | 'previous'>('recent');

  const recent = box.snapshots[0];
  const previous = box.snapshots[1];
  const isRateLimit = /limit/i.test(error);

  async function handleRefresh() {
    setRefreshing(true);
    setError('');
    const result = await onRefresh(box.id);
    if (!result.ok) setError(result.error || 'Nie udało się odświeżyć.');
    setRefreshing(false);
  }

  async function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== box.topic) await onEdit(box.id, trimmed);
    setEditing(false);
  }

  return (
    <div className="card" style={{ ['--card-accent' as string]: accentFor(box.id) }}>
      <div className="card-head">
        {editing ? (
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            style={{ padding: '4px 8px' }}
            autoFocus
          />
        ) : (
          <div className="card-grip">
            <button
              className="drag-handle desktop-only"
              onMouseDown={onDragHandleDown}
              aria-label="Przeciągnij, aby zmienić kolejność"
              title="Przeciągnij, aby zmienić kolejność"
            >
              <GripIcon />
            </button>
            <h3 className="card-title">{box.topic}</h3>
          </div>
        )}
        <div className="card-actions">
          <button
            className="icon-btn mobile-only"
            onClick={() => onMove(box.id, -1)}
            disabled={isFirst}
            aria-label="Przenieś wyżej"
          >
            <ArrowUpIcon />
          </button>
          <button
            className="icon-btn mobile-only"
            onClick={() => onMove(box.id, 1)}
            disabled={isLast}
            aria-label="Przenieś niżej"
          >
            <ArrowDownIcon />
          </button>
          {editing ? (
            <button className="icon-btn accent" onClick={saveEdit} aria-label="Zapisz">
              <CheckIcon />
            </button>
          ) : (
            <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edytuj temat">
              <EditIcon />
            </button>
          )}
          <button
            className={`icon-btn${refreshing ? '' : ' accent'}`}
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Odśwież"
          >
            {refreshing ? <span className="spinner" /> : <RefreshIcon />}
          </button>
          <button className="icon-btn" onClick={() => onDelete(box.id)} aria-label="Usuń">
            <TrashIcon />
          </button>
        </div>
      </div>

      {recent && (
        <p className="timestamp">
          {new Date(recent.fetched_at).toLocaleString('pl-PL', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}

      {error && (
        <div className={`banner ${isRateLimit ? 'banner-warning' : 'banner-error'}`}>
          <AlertIcon />
          <span>{isRateLimit ? 'Wyczerpano dzienny darmowy limit Gemini. Spróbuj ponownie jutro.' : error}</span>
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab${activeTab === 'recent' ? ' tab-active' : ''}`}
          onClick={() => setActiveTab('recent')}
        >
          Ostatnie 24h
        </button>
        <button
          className={`tab${activeTab === 'previous' ? ' tab-active' : ''}`}
          onClick={() => setActiveTab('previous')}
        >
          Dzień wcześniej
        </button>
      </div>

      <NewsSection snapshot={activeTab === 'recent' ? recent : previous} />
    </div>
  );
}
