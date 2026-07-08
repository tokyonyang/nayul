import { buildReportPrompt } from '../../../lib/prompt';

export async function POST(req) {
  try {
    const { history, mode, bookTitle, settings } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: 'OPENAI_API_KEY가 설정되지 않았어요.' }, { status: 500 });
    }

    const transcript = (history || [])
      .map((m) => `${m.role === 'assistant' ? 'AI' : '나율/엄마'}: ${m.content}`)
      .join('\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: buildReportPrompt({ mode, bookTitle, settings }) },
          { role: 'user', content: `오늘의 대화 기록:\n\n${transcript}` },
        ],
        temperature: 0.4,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `OpenAI 오류 (${res.status}): ${err.slice(0, 300)}` }, { status: 502 });
    }

    const data = await res.json();
    let parsed;
    try {
      parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    } catch {
      parsed = { feedback: data.choices?.[0]?.message?.content || '', record: null };
    }
    return Response.json(parsed);
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
