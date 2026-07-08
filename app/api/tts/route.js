// 하이브리드 TTS API
// provider: 'google' → Google Cloud TTS (한국어 특화, GOOGLE_TTS_API_KEY 필요)
// provider: 'openai' → OpenAI gpt-4o-mini-tts
// POST { text, voice, mode: 'ko'|'en', provider } → audio/mpeg

const OPENAI_INSTRUCTIONS = {
  ko: 'You are a warm, playful Korean kindergarten teacher talking with a 5-year-old boy. Speak natural, friendly Korean — slowly, clearly, with gentle warmth. Sound effects like 부릉부릉 should sound fun. Never sound robotic.',
  en: 'You are a warm, encouraging English teacher talking with a 5-year-old Korean boy learning English. Speak slowly and clearly with a bright, friendly tone. If Korean words appear, pronounce them naturally in Korean.',
};

async function googleTTS(text, voice) {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) return { error: 'GOOGLE_TTS_API_KEY 환경변수가 설정되지 않았어요. (Google Cloud → Cloud Text-to-Speech API 사용 설정 + API 키 발급 + 결제 계정 연결 필요)' };

  const voiceName = voice || 'ko-KR-Chirp3-HD-Aoede';
  const body = {
    input: { text: text.slice(0, 4500) },
    voice: { languageCode: 'ko-KR', name: voiceName },
    audioConfig: { audioEncoding: 'MP3' },
  };
  // Chirp3-HD 계열은 speakingRate 미지원 가능성 → 구형 음성에만 적용
  if (!voiceName.includes('Chirp')) body.audioConfig.speakingRate = 0.95;

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    return { error: `Google TTS 오류 (${res.status}): ${err.slice(0, 250)}` };
  }
  const data = await res.json();
  if (!data.audioContent) return { error: 'Google TTS 응답에 오디오가 없어요.' };
  return { audio: Buffer.from(data.audioContent, 'base64') };
}

async function openaiTTS(text, voice, mode) {
  if (!process.env.OPENAI_API_KEY) return { error: 'OPENAI_API_KEY가 설정되지 않았어요.' };
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
      instructions: OPENAI_INSTRUCTIONS[mode === 'en' ? 'en' : 'ko'],
      response_format: 'mp3',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { error: `OpenAI TTS 오류 (${res.status}): ${err.slice(0, 250)}` };
  }
  return { audio: Buffer.from(await res.arrayBuffer()) };
}

export async function POST(req) {
  try {
    const { text, voice, mode, provider } = await req.json();
    if (!text || !text.trim()) return Response.json({ error: 'empty text' }, { status: 400 });

    let result;
    if (provider === 'google') {
      result = await googleTTS(text, voice);
      // 구글 실패 시 OpenAI로 1차 폴백 (키가 있으면)
      if (result.error && process.env.OPENAI_API_KEY) {
        const fb = await openaiTTS(text, 'marin', mode);
        if (!fb.error) result = fb;
      }
    } else {
      result = await openaiTTS(text, voice, mode);
    }

    if (result.error) return Response.json({ error: result.error }, { status: 502 });
    return new Response(result.audio, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
