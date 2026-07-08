import { buildSystemPrompt } from '../../../lib/prompt';

export async function POST(req) {
  try {
    const { history, mode, bookTitle, settings } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: 'OPENAI_API_KEY 환경변수가 설정되지 않았어요. Vercel 프로젝트 설정에서 추가해 주세요.' },
        { status: 500 }
      );
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt({ mode, bookTitle, settings }) },
      ...(history || []).slice(-40),
    ];

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        messages,
        temperature: 0.8,
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `OpenAI 오류 (${res.status}): ${err.slice(0, 300)}` }, { status: 502 });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
