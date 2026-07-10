// 정확 인식 모드 — 녹음 파일을 OpenAI 음성인식으로 전사
// POST FormData { audio: Blob, lang: 'ko'|'en' } → { text }

export async function POST(req) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: 'OPENAI_API_KEY가 설정되지 않았어요.' }, { status: 500 });
    }
    const form = await req.formData();
    const audio = form.get('audio');
    const lang = form.get('lang') === 'en' ? 'en' : 'ko';
    if (!audio || typeof audio === 'string') {
      return Response.json({ error: '오디오가 없어요.' }, { status: 400 });
    }

    const type = audio.type || 'audio/webm';
    const ext = type.includes('mp4') ? 'mp4' : type.includes('mpeg') ? 'mp3' : type.includes('wav') ? 'wav' : 'webm';

    const fd = new FormData();
    fd.append('file', audio, `audio.${ext}`);
    fd.append('model', process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe');
    fd.append('language', lang);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: fd,
    });

    if (!res.ok) {
      const err = await res.text();
      // 최신 모델 미지원 계정 대비 whisper-1 폴백
      if (!process.env.OPENAI_STT_MODEL) {
        const fd2 = new FormData();
        fd2.append('file', audio, `audio.${ext}`);
        fd2.append('model', 'whisper-1');
        fd2.append('language', lang);
        const res2 = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: fd2,
        });
        if (res2.ok) {
          const d2 = await res2.json();
          return Response.json({ text: (d2.text || '').trim() });
        }
      }
      return Response.json({ error: `전사 오류 (${res.status}): ${err.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    return Response.json({ text: (data.text || '').trim() });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
