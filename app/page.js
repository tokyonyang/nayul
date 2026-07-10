'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { libList } from '../lib/libraryClient';
import { syncSettingsFromServer } from '../lib/settingsClient';

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [extra, setExtra] = useState('');
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [searching, setSearching] = useState(false);
  const [library, setLibrary] = useState([]);

  useEffect(() => {
    libList().then(({ books }) => setLibrary(books || []));
    syncSettingsFromServer();
  }, []);

  const pickFromLibrary = (id) => {
    const b = library.find((x) => String(x.id) === id);
    if (!b) return;
    setSelected({ ...b, libraryId: b.id, savedTranscript: b.transcript || '' });
    setTitle(b.title);
    setResults(null);
  };

  const search = async () => {
    if (!title.trim()) return;
    setSearching(true);
    setSelected(null);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), extra: extra.trim() }),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const start = (mode) => {
    try {
      if (selected) sessionStorage.setItem('nayul_book', JSON.stringify(selected));
      else sessionStorage.removeItem('nayul_book');
    } catch {}
    const q = new URLSearchParams({ mode });
    const t = selected?.title || title.trim();
    if (t) q.set('book', t);
    router.push(`/session?${q.toString()}`);
  };

  const parentGate = (path) => {
    const a = Math.floor(Math.random() * 5) + 4;
    const b = Math.floor(Math.random() * 5) + 3;
    const ans = prompt(`엄마 확인 문제예요!\n${a} × ${b} = ?`);
    if (ans !== null && parseInt(ans, 10) === a * b) router.push(path);
    else if (ans !== null) alert('다시 확인해 주세요.');
  };

  return (
    <div className="wrap">
      <div style={{ fontSize: 54, textAlign: 'center', marginTop: 18 }}>🚌📚</div>
      <h1 className="center">나율이의 하브루타</h1>
      <p className="sub center">오늘은 어떤 책을 읽을까?</p>

      <div className="stack" style={{ flex: 1 }}>
        {library.length > 0 && (
          <select className="input" defaultValue="" onChange={(e) => pickFromLibrary(e.target.value)}>
            <option value="" disabled>
              📚 우리집 서재에서 고르기 ({library.length}권)
            </option>
            {library.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
                {b.transcript && b.transcript.length > 100 ? ' 👂' : ''}
              </option>
            ))}
          </select>
        )}
        <input
          className="input"
          placeholder="책 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <div className="row">
          <input
            className="input"
            placeholder="출판사·시리즈·저자 (같은 제목 구분용)"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <button
            className="btn"
            style={{ width: 'auto', padding: '13px 18px', fontSize: 17, flexShrink: 0 }}
            onClick={search}
            disabled={searching || !title.trim()}
          >
            {searching ? <span className="spin" /> : '🔍 찾기'}
          </button>
        </div>

        {results && results.length === 0 && (
          <p className="sub center" style={{ margin: 0 }}>
            검색 결과가 없어요. 그래도 시작할 수 있어요 — AI가 귀 쫑긋 세우고 같이 들을게요!
          </p>
        )}

        {results && results.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <p className="sub" style={{ margin: 0 }}>우리가 읽은 책을 골라 주세요:</p>
            {results.map((b, i) => (
              <button
                key={i}
                className="card bookCard"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: selected === b ? '3px solid var(--grass)' : '3px solid transparent',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  padding: 12,
                }}
                onClick={() => setSelected(selected === b ? null : b)}
              >
                {b.thumbnail ? (
                  <img src={b.thumbnail} alt="" style={{ width: 44, borderRadius: 6, flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: 30 }}>📕</span>
                )}
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: 15 }}>{b.title}</strong>
                  <span className="sub" style={{ fontSize: 13, margin: 0 }}>
                    {[b.author, b.publisher].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {selected === b && <span style={{ marginLeft: 'auto', fontSize: 20 }}>✅</span>}
              </button>
            ))}
          </div>
        )}

        <button className="btn big yellow" onClick={() => start('ko')}>
          📖 한글책 이야기하기
        </button>
        <button className="btn big" onClick={() => start('en')}>
          🔤 English Book!
        </button>
        {selected && (selected.description || (selected.savedTranscript && selected.savedTranscript.length > 200)) && (
          <p className="sub center" style={{ margin: 0 }}>
            ✅ {selected.savedTranscript && selected.savedTranscript.length > 200
              ? '지난번에 읽어준 내용을 기억하는 책이에요 — 바로 이야기할 수 있어요!'
              : '책 소개를 찾았어요 — 읽기를 건너뛰고 바로 이야기할 수도 있어요!'}
          </p>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
        <button className="btn ghost" onClick={() => parentGate('/library')}>
          📚 서재
        </button>
        <button className="btn ghost" onClick={() => parentGate('/records')}>
          📒 독서 기록
        </button>
        <button className="btn ghost" onClick={() => parentGate('/parent')}>
          ⚙️ 엄마 설정
        </button>
      </div>
    </div>
  );
}
