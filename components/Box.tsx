'use client';

import { useState } from 'react';
import type { Box as BoxType } from '@/lib/types';
import { accentFor } from '@/lib/accent';
import BoxNews from './BoxNews';
import ConfirmDialog from './ConfirmDialog';
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    <div
      className={`card${refreshing ? ' card-refreshing' : ''}`}
      style={{ ['--card-accent' as string]: accentFor(box.id) }}
    >
      <div className="card-head">
        {editing ? (
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            style={{ padding: '4px 8px' }}
            aria-label="Edytuj temat boxa"
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
            <h2 className="card-title">{box.topic}</h2>
          </div>
        )}
        <div className="card-actions">
          {/* Strzałki są dostępne na KAŻDEJ szerokości - to jedyny sposób zmiany kolejności
              działający z klawiatury. Drag & drop (uchwyt obok tytułu) jest tylko dodatkiem
              dla myszy; gdyby strzałki znikały na desktopie, reorder łamałby WCAG 2.1.1. */}
          <button
            className="icon-btn"
            onClick={() => onMove(box.id, -1)}
            disabled={isFirst}
            aria-label={`Przenieś temat "${box.topic}" wyżej`}
          >
            <ArrowUpIcon />
          </button>
          <button
            className="icon-btn"
            onClick={() => onMove(box.id, 1)}
            disabled={isLast}
            aria-label={`Przenieś temat "${box.topic}" niżej`}
          >
            <ArrowDownIcon />
          </button>
          {editing ? (
            <button className="icon-btn accent" onClick={saveEdit} aria-label="Zapisz temat">
              <CheckIcon />
            </button>
          ) : (
            <button
              className="icon-btn"
              onClick={() => setEditing(true)}
              aria-label={`Edytuj temat "${box.topic}"`}
            >
              <EditIcon />
            </button>
          )}
          <button
            className={`icon-btn${refreshing ? '' : ' accent'}`}
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label={`Odśwież temat "${box.topic}"`}
          >
            {refreshing ? <span className="spinner" /> : <RefreshIcon />}
          </button>
          <button
            className="icon-btn icon-btn-danger"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Usuń temat "${box.topic}"`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Usunąć temat?"
          message={
            <>
              Czy na pewno chcesz usunąć temat <strong>„{box.topic}”</strong> razem z jego
              newsami? Tej operacji nie można cofnąć.
            </>
          }
          confirmLabel="Usuń"
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete(box.id);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      <BoxNews snapshots={box.snapshots} refreshing={refreshing}>
        {error && (
          <div className={`banner ${isRateLimit ? 'banner-warning' : 'banner-error'}`} role="alert">
            <AlertIcon />
            {/* Pokazujemy prawdziwy komunikat z serwera - odróżnia limit aplikacji (X/dobę)
                od realnego limitu zapytań Gemini. isRateLimit steruje tylko kolorem banera. */}
            <span>{error}</span>
          </div>
        )}
      </BoxNews>
    </div>
  );
}
