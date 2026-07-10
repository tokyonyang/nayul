// 우리집 서재 클라이언트 헬퍼 — Supabase 미설정 시 localStorage로 동작
const LS_KEY = 'nayul_library';

function lsGet() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}
function lsSet(books) {
  localStorage.setItem(LS_KEY, JSON.stringify(books.slice(0, 300)));
}

export async function libList() {
  try {
    const res = await fetch('/api/library');
    const data = await res.json();
    if (data.disabled) return { books: lsGet(), local: true };
    if (data.error) return { books: [], error: data.error };
    return { books: data.books || [] };
  } catch (e) {
    return { books: lsGet(), local: true };
  }
}

export async function libAdd(books) {
  const rows = books.map((b) => ({
    title: b.title || '',
    author: b.author || '',
    publisher: b.publisher || '',
    description: b.description || '',
    thumbnail: b.thumbnail || '',
    transcript: '',
  }));
  const res = await fetch('/api/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
  });
  const data = await res.json();
  if (data.disabled) {
    const cur = lsGet();
    const withIds = rows.map((r) => ({ ...r, id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), created_at: new Date().toISOString() }));
    lsSet([...withIds, ...cur]);
    return { saved: withIds, local: true };
  }
  return data;
}

export async function libDelete(id) {
  const res = await fetch('/api/library', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const data = await res.json();
  if (data.disabled) {
    lsSet(lsGet().filter((b) => b.id !== id));
    return { ok: true, local: true };
  }
  return data;
}

export async function libUpdate(id, fields) {
  const res = await fetch('/api/library', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...fields }),
  });
  const data = await res.json();
  if (data.disabled) {
    const books = lsGet();
    const i = books.findIndex((b) => b.id === id);
    if (i >= 0) {
      Object.assign(books[i], fields);
      lsSet(books);
    }
    return { ok: true, local: true };
  }
  return data;
}

export async function libSaveTranscript(id, transcript) {
  const res = await fetch('/api/library', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, transcript }),
  });
  const data = await res.json();
  if (data.disabled) {
    const books = lsGet();
    const i = books.findIndex((b) => b.id === id);
    if (i >= 0) {
      books[i].transcript = transcript;
      lsSet(books);
    }
    return { ok: true, local: true };
  }
  return data;
}
