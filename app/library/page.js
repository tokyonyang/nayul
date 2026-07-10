'use client';

import { useEffect, useRef, useState } from 'react';
import { libList, libAdd, libDelete, libUpdate } from '../../lib/libraryClient';

export default function LibraryPage() {
  const [books, setBooks] = useState(null);
  const [note, setNote] = useState('');
  const [bulk, setBulk] = useState('');
  const [progress, setProgress] = useState(null); // {done, total, current}
  const [reco, setReco] = useState('');
  const [recoBusy, setRecoBusy] = useState(false);
  const [scanProgress, setScanProgress] = useState(null); // {done, total}
  const fileRef = useRef(null);
  const blurbFileRef = useRef(null);
  const pagesFileRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [descDraft, setDescDraft] = useState('');
  const [blurbBusy, setBlurbBusy] = useState(false);

  const openEdit = (b) => {
    if (editingId === b.id) {
      setEditingId(null);
      return;
    }
    setEditingId(b.id);
    setDescDraft(b.description || '');
  };

  const saveDesc = async (id) => {
    await libUpdate(id, { description: descDraft.trim() });
    setEditingId(null);
    load();
  };

  const scanPages = async (files, book) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 6);
    setBlurbBusy(true);
    try {
      // 여러 장을 한 요청에 담으므로 더 강하게 압축 (요청 크기 제한 대응)
      const imgs = [];
      for (const f of list) imgs.push(await compressImage(f, 1400, 0.75));
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: imgs, task: 'pages' }),
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else if (data.summary) {
        setDescDraft(data.summary);
        if (!book.publisher && data.publisher) {
          await libUpdate(book.id, { publisher: data.publisher });
        }
      } else alert('사진에서 내용을 정리하지 못했어요. 글이 잘 보이는 장면으로 다시 찍어 보세요.');
    } catch (e) {
      alert(e.message);
    } finally {
      setBlurbBusy(false);
      if (pagesFileRef.current) pagesFileRef.current.value = '';
    }
  };

  const scanBlurb = async (file, book) => {
    if (!file) return;
    setBlurbBusy(true);
    try {
      const dataUrl = await compressImage(file, 1800, 0.85);
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, task: 'blurb' }),
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else if (data.summary) {
        setDescDraft(data.summary);
        // 출판사가 비어 있고 사진에서 찾았으면 함께 저장 준비
        if (!book.publisher && data.publisher) {
          await libUpdate(book.id, { publisher: data.publisher });
        }
      } else alert('사진에서 소개 문구를 찾지 못했어요. 뒷표지 글자가 잘 보이게 다시 찍어 보세요.');
    } catch (e) {
      alert(e.message);
    } finally {
      setBlurbBusy(false);
      if (blurbFileRef.current) blurbFileRef.current.value = '';
    }
  };

  // 사진을 캔버스로 축소·압축 (Vercel 요청 크기 제한 대응)
  const compressImage = (file, maxDim = 2000, quality = 0.85) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = url;
    });

  const scanPhotos = async (files) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 10);
    const collected = [];
    setScanProgress({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      try {
        const dataUrl = await compressImage(list[i]);
        const res = await fetch('/api/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl }),
        });
        const data = await res.json();
        if (data.error) setNote(`⚠️ 사진 ${i + 1}: ${data.error}`);
        else collected.push(...(data.titles || []));
      } catch (e) {
        setNote(`⚠️ 사진 ${i + 1} 처리 실패: ${e.message}`);
      }
      setScanProgress({ done: i + 1, total: list.length });
    }
    setScanProgress(null);
    if (collected.length) {
      // 기존 입력 + 서재와 중복 제거 후 등록칸에 채움
      const inLibrary = new Set((books || []).map((b) => b.title.replace(/\s+/g, '')));
      const seen = new Set(
        bulk.split('\n').map((l) => l.split('/')[0].trim().replace(/\s+/g, '')).filter(Boolean)
      );
      const fresh = [];
      for (const t of collected) {
        const key = t.split('/')[0].trim().replace(/\s+/g, '');
        if (!key || seen.has(key) || inLibrary.has(key)) continue;
        seen.add(key);
        fresh.push(t.trim());
      }
      setBulk((prev) => (prev.trim() ? prev.trim() + '\n' : '') + fresh.join('\n'));
      setNote(`📷 ${fresh.length}권을 찾았어요! 목록을 확인·수정한 뒤 아래 등록 버튼을 눌러 주세요.`);
    } else {
      setNote('📷 사진에서 책 제목을 찾지 못했어요. 책등이 잘 보이게 다시 찍어 보세요.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const load = async () => {
    const { books, local, error } = await libList();
    setBooks(books);
    if (local) setNote('이 기기에 저장된 서재예요. (Supabase 연결 시 서버 저장으로 전환)');
    else if (error) setNote(`⚠️ ${error}`);
    else setNote('');
  };

  useEffect(() => {
    load();
  }, []);

  const bulkAdd = async () => {
    const lines = bulk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;

    const existing = new Set((books || []).map((b) => b.title.replace(/\s+/g, '')));
    const found = [];
    const missed = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      setProgress({ done: i, total: lines.length, current: line });
      // "제목 / 출판사" 형태 지원
      const [title, extra] = line.split('/').map((s) => s.trim());
      try {
        const res = await fetch('/api/book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, extra: extra || '' }),
        });
        const data = await res.json();
        const best = (data.results || [])[0];
        if (best && !existing.has(best.title.replace(/\s+/g, ''))) {
          found.push(best);
          existing.add(best.title.replace(/\s+/g, ''));
        } else if (!best) {
          // 검색 실패 → 제목만으로 등록 (전사가 쌓이면 내용을 알게 됨)
          missed.push(title);
          found.push({ title, author: '', publisher: extra || '', description: '', thumbnail: '' });
        }
      } catch {
        missed.push(title);
      }
    }
    setProgress({ done: lines.length, total: lines.length, current: '저장 중…' });

    if (found.length) {
      const r = await libAdd(found);
      if (r.error) setNote(`⚠️ ${r.error}`);
    }
    setProgress(null);
    setBulk('');
    if (missed.length) {
      setNote(`✅ ${found.length}권 등록 완료. 검색이 안 된 ${missed.length}권은 제목만 등록했어요 — 한 번 읽어주면(같이 듣기) 내용을 기억해요.`);
    } else {
      setNote(`✅ ${found.length}권 등록 완료!`);
    }
    load();
  };

  const remove = async (id) => {
    if (!confirm('이 책을 서재에서 뺄까요?')) return;
    await libDelete(id);
    load();
  };

  const recommend = async () => {
    setRecoBusy(true);
    setReco('');
    try {
      // 최근 기록도 함께 전달
      let records = [];
      try {
        const r = await fetch('/api/records');
        const d = await r.json();
        records = d.disabled ? JSON.parse(localStorage.getItem('nayul_records') || '[]') : d.records || [];
      } catch {}
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: books || [], records }),
      });
      const data = await res.json();
      setReco(data.error ? `⚠️ ${data.error}` : data.text);
    } catch (e) {
      setReco(`⚠️ ${e.message}`);
    } finally {
      setRecoBusy(false);
    }
  };

  return (
    <div className="wrap">
      <div className="top">
        <a href="/" className="title">← 📚 우리집 서재</a>
        {books && <span className="badge">{books.length}권</span>}
      </div>
      {note && <p className="sub">{note}</p>}

      <div className="card stack" style={{ gap: 10 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => scanPhotos(e.target.files)}
        />
        {scanProgress ? (
          <p className="sub center" style={{ margin: 0 }}>
            <span className="spin" /> 책장 사진 {scanProgress.done}/{scanProgress.total} 읽는 중… 📷
          </p>
        ) : (
          <button className="btn green" onClick={() => fileRef.current?.click()}>
            📷 책장 사진으로 책 찾기
          </button>
        )}
        <p className="sub" style={{ margin: 0, fontSize: 13 }}>
          책장을 여러 장으로 나눠 찍으면(한 장에 한두 칸씩, 책등이 또렷하게) 인식률이 좋아요. 최대 10장.
          찾은 제목은 아래 칸에 채워지고, 확인 후 등록하면 됩니다.
        </p>
        <label className="field" style={{ margin: 0 }}>
          책 제목을 한 줄에 한 권씩 붙여넣으세요. 같은 제목이 많은 책은 「제목 / 출판사」로 적어주세요.
        </label>
        <textarea
          className="input"
          rows={5}
          placeholder={'구름빵\n달님 안녕\n지하철을 타고서 / 창비\nThe Very Hungry Caterpillar'}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          style={{ resize: 'vertical', fontSize: 15 }}
        />
        {progress ? (
          <p className="sub center" style={{ margin: 0 }}>
            <span className="spin" /> {progress.done}/{progress.total} — {progress.current}
          </p>
        ) : (
          <button className="btn yellow" onClick={bulkAdd} disabled={!bulk.trim()}>
            🔍 검색해서 서재에 등록
          </button>
        )}
      </div>

      {books && books.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <button className="btn green" onClick={recommend} disabled={recoBusy}>
            {recoBusy ? '서재를 살펴보는 중…' : '🔗 연계독서 추천 (조직화 / 사고확장)'}
          </button>
          {reco && (
            <div className="card feedback" style={{ marginTop: 10 }}>
              {reco}
            </div>
          )}
        </div>
      )}

      <div className="stack" style={{ marginTop: 14 }}>
        {books === null && (
          <p className="center">
            <span className="spin" />
          </p>
        )}
        {books &&
          books.map((b) => (
            <div className="card" key={b.id} style={{ padding: 12 }}>
              <div className="row" style={{ gap: 12 }}>
              {b.thumbnail ? (
                <img src={b.thumbnail} alt="" style={{ width: 40, borderRadius: 6, flexShrink: 0 }} />
              ) : (
                <span style={{ fontSize: 26 }}>📕</span>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ display: 'block', fontSize: 15 }}>{b.title}</strong>
                <span className="sub" style={{ fontSize: 12.5 }}>
                  {[b.author, b.publisher].filter(Boolean).join(' · ')}
                  {b.transcript && b.transcript.length > 100 ? ' · 👂 내용 기억함' : ''}
                </span>
              </div>
              <button className="btn ghost" style={{ padding: 6, flexShrink: 0 }} onClick={() => openEdit(b)}>
                {b.description && b.description.length > 50 ? '📝' : '📝❗'}
              </button>
              <button className="btn ghost" style={{ padding: 6, flexShrink: 0 }} onClick={() => remove(b.id)}>
                🗑
              </button>
              </div>
              {editingId === b.id && (
                <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="책 소개를 적어주세요. 전집처럼 검색이 안 되는 책은 뒷표지 사진으로 만들 수도 있어요."
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    style={{ resize: 'vertical', fontSize: 14 }}
                  />
                  <input
                    ref={blurbFileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => scanBlurb(e.target.files?.[0], b)}
                  />
                  <input
                    ref={pagesFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => scanPages(e.target.files, b)}
                  />
                  <div className="row">
                    <button
                      className="btn"
                      style={{ fontSize: 14, padding: '11px 6px' }}
                      onClick={() => pagesFileRef.current?.click()}
                      disabled={blurbBusy}
                    >
                      {blurbBusy ? '읽는 중…' : '📖 책 장면들로 (최대 6장)'}
                    </button>
                    <button
                      className="btn"
                      style={{ fontSize: 14, padding: '11px 6px' }}
                      onClick={() => blurbFileRef.current?.click()}
                      disabled={blurbBusy}
                    >
                      📷 뒷표지로
                    </button>
                    <button
                      className="btn yellow"
                      style={{ fontSize: 14, padding: '11px 10px' }}
                      onClick={() => saveDesc(b.id)}
                    >
                      💾 저장
                    </button>
                  </div>
                  <p className="sub" style={{ margin: 0, fontSize: 12.5 }}>
                    프뢰벨처럼 뒷표지에 소개가 없는 전집은 책장을 넘기며 주요 장면 4~6장을 찍어 주세요. 글이
                    보이는 페이지가 섞이면 더 정확해요.
                  </p>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
