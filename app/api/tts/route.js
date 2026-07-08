// OpenAI TTS API — gpt-4o-mini-tts
// POST { text, voice, mode: 'ko' | 'en' } → audio/mpeg

const INSTRUCTIONS = {
  ko: 'You are a warm, playful Korean kindergarten teacher talking with a 5-year-old boy. Speak natural, friendly Korean — slowly, clearly, with gentle warmth. Sound effects like 부릉부릉 should sound fun. Never sound robotic.',
  en: 'You are a warm, encouraging English teacher talking with a 5-year-old Korean boy learning English. Speak slowly and clearly with a bright, friendly tone. If Korean words appear, pronounce them naturally in Korean.',
};

export async function POST(req) {
  try {
    const { text, voice, mode } = await req.json();
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: 'OPENAI_API_KEY가 설정되지 않았어요.' }, { status: 500 });
    }
    if (!text || !text.trim()) {
      return Response.json({ error: 'empty text' }, { status: 400 });
    }

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
        voice: voice || 'marin',
        input: text.slice(0, 3500),
        instructions: INSTRUCTIONS[mode === 'en' ? 'en' : 'ko'],
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `TTS 오류 (${res.status}): ${err.slice(0, 200)}` }, { status: 502 });
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
