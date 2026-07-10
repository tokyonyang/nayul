// 설정 동기화 API — 기기가 바뀌어도 설정 유지
// Supabase nayul_settings 테이블 (key='default' 단일 행)
// 미설정 시 { disabled: true } → 클라이언트가 localStorage만 사용

const TABLE = 'nayul_settings';

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
  if (!cfg) return Response.json({ disabled: true });
  try {
    const res = await fetch(`${cfg.base}?key=eq.default&select=data`, {
      headers: cfg.headers,
      cache: 'no-store',
    });
    if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 });
    const rows = await res.json();
    return Response.json({ settings: rows[0]?.data || null });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function PUT(req) {
  const cfg = sb();
  const settings = await req.json();
  if (!cfg) return Response.json({ disabled: true });
  try {
    const res = await fetch(cfg.base, {
      method: 'POST',
      headers: {
        ...cfg.headers,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ key: 'default', data: settings, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 200) }, { status: 502 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
