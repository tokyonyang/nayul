// Supabase REST API 직접 호출 (별도 라이브러리 불필요)
// 환경변수가 없으면 { disabled: true }를 반환 → 클라이언트가 localStorage로 대체 저장

const TABLE = 'nayul_records';

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: `${url.replace(/\/$/, '')}/rest/v1/${TABLE}`, key };
}

export async function GET() {
  const cfg = sb();
  if (!cfg) return Response.json({ disabled: true, records: [] });
  try {
    const res = await fetch(`${cfg.url}?select=*&order=created_at.desc&limit=100`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Supabase 오류: ${err.slice(0, 300)}` }, { status: 502 });
    }
    const records = await res.json();
    return Response.json({ records });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  const cfg = sb();
  const body = await req.json();
  if (!cfg) return Response.json({ disabled: true });
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Supabase 저장 실패: ${err.slice(0, 300)}` }, { status: 502 });
    }
    const saved = await res.json();
    return Response.json({ saved });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
