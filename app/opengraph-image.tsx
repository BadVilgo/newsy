import { ImageResponse } from 'next/og';

// Dynamiczny obrazek podglądu linku (LinkedIn/Slack/Twitter). Next dokleja go automatycznie
// jako og:image i twitter:image. Tekst celowo bez polskich znaków - domyślny font next/og
// nie ma pełnego zestawu diakrytyków, a ASCII renderuje się pewnie.
export const alt = 'newsy.live - tablica najwazniejszych newsow';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#0e131f',
          borderLeft: '16px solid #1f6feb',
          padding: '80px 90px',
          color: '#e6e9f0',
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 4, color: '#3fb6a8' }}>
          NEXT.JS · SUPABASE · GEMINI
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 24 }}>
          <span style={{ fontSize: 120, fontWeight: 700 }}>newsy</span>
          <span style={{ fontSize: 120, fontWeight: 700, color: '#3fb6a8' }}>.live</span>
        </div>
        <div style={{ fontSize: 40, color: '#9aa3b8', marginTop: 12 }}>
          The news that matters, refreshed every morning.
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 44 }}>
          {['24h', '48h', 'AI-curated'].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 28,
                color: '#e6e9f0',
                border: '1px solid #2c374b',
                borderRadius: 999,
                padding: '8px 22px',
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
