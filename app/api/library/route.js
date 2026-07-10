// 우리집 서재 API — Supabase REST 직접 호출
// 환경변수 없으면 { disabled: true } → 클라이언트가 localStorage로 대체

const TABLE = 'nayul_library';

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    base: `${url.replace(/\/$/, '')}/rest/v1/${TABLE}`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  };
}

export async function GET() {
  const cfg = sb();
  if (!cfg) return Response.json({ disabled: true, books: [] });
  try {
    const res = await fetch(`${cfg.base}?select=*&order=created_at.desc&limit=300`, {
      headers: cfg.headers,
      cache: 'no-store',
    });
    if (!res.ok) return Response.json({ error: `Supabase 오류: ${(await res.text()).slice(0, 200)}` }, { status: 502 });
    return Response.json({ books: await res.json() });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  const cfg = sb();
  const body = await req.json(); // 배열 또는 단일 객체
  if (!cfg) return Response.json({ disabled: true });
  try {
    const res = await fetch(cfg.base, {
      method: 'POST',
      headers: { ...cfg.headers, Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return Response.json({ error: `저장 실패: ${(await res.text()).slice(0, 200)}` }, { status: 502 });
    return Response.json({ saved: await res.json() });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// 전사 저장 등 부분 업데이트: { id, ...fields }
export async function PATCH(req) {
  const cfg = sb();
  const { id, ...fields } = await req.json();
  if (!cfg) return Response.json({ disabled: true });
  if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
  try {
    const res = await fetch(`${cfg.base}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: cfg.headers,
      body: JSON.stringify(fields),
    });
    if (!res.ok) return Response.json({ error: `수정 실패: ${(await res.text()).slice(0, 200)}` }, { status: 502 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(req) {
  const cfg = sb();
  const { id } = await req.json();
  if (!cfg) return Response.json({ disabled: true });
  try {
    const res = await fetch(`${cfg.base}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: cfg.headers,
    });
    if (!res.ok) return Response.json({ error: `삭제 실패: ${(await res.text()).slice(0, 200)}` }, { status: 502 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
