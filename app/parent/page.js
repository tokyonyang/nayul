'use client';

import { useEffect, useRef, useState } from 'react';

const DEFAULTS = {
  think: 2,
  ko: 2,
  en: 1,
  depth: 'normal',
  stt: 'auto',
  koTts: 'device',
  enTts: 'device',
  googleVoice: 'ko-KR-Chirp3-HD-Aoede',
  ttsVoice: 'marin',
};

const GOOGLE_VOICES = [
  ['ko-KR-Chirp3-HD-Aoede', 'Aoede — 최신 HD, 자연스러운 여성 (추천)'],
  ['ko-KR-Chirp3-HD-Leda', 'Leda — 최신 HD, 젊은 여성'],
  ['ko-KR-Chirp3-HD-Kore', 'Kore — 최신 HD, 또렷한 여성'],
  ['ko-KR-Chirp3-HD-Zephyr', 'Zephyr — 최신 HD, 밝은 여성'],
  ['ko-KR-Chirp3-HD-Puck', 'Puck — 최신 HD, 경쾌한 남성'],
  ['ko-KR-Chirp3-HD-Charon', 'Charon — 최신 HD, 차분한 남성'],
  ['ko-KR-Neural2-A', 'Neural2-A — 여성 (구형, 안정적)'],
  ['ko-KR-Neural2-B', 'Neural2-B — 여성 (구형)'],
  ['ko-KR-Neural2-C', 'Neural2-C — 남성 (구형)'],
  ['ko-KR-Wavenet-A', 'Wavenet-A — 여성 (가장 저렴)'],
];

const OPENAI_VOICES = [
  ['marin', 'Marin — 최고 품질 권장, 차분하고 또렷한 여성'],
  ['cedar', 'Cedar — 최고 품질 권장, 부드러운 남성'],
  ['nova', 'Nova — 밝고 경쾌한 여성'],
  ['coral', 'Coral — 따뜻하고 다정한 여성'],
  ['shimmer', 'Shimmer — 조용하고 포근한 여성'],
  ['sage', 'Sage — 차분한 중성 톤'],
  ['fable', 'Fable — 이야기꾼 느낌'],
  ['alloy', 'Alloy — 중립적인 톤'],
  ['ash', 'Ash — 낮고 안정적인 남성'],
  ['ballad', 'Ballad — 감성적인 톤'],
  ['echo', 'Echo — 명료한 남성'],
  ['onyx', 'Onyx — 깊고 묵직한 남성'],
  ['verse', 'Verse — 리듬감 있는 톤'],
];

const SAMPLE_KO = '부릉부릉! 나율아, 오늘 읽은 책에서 어떤 장면이 제일 기억나?';
const SAMPLE_EN = 'Great job, Nayul! The little bus was very fast. Why was he so happy?';

export default function ParentPage() {
  const [s, setS] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(null); // 'ko' | 'en' | null
  const audioRef = useRef(null);

  useEffect(() => {
    try {
      setS({ ...DEFAULTS, ...JSON.parse(localStorage.getItem('nayul_settings') || '{}') });
    } catch {}
    return () => audioRef.current?.pause();
  }, []);

  const update = (patch) => {
    const next = { ...s, ...patch };
    setS(next);
    localStorage.setItem('nayul_settings', JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  const stopSample = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    setPlaying(null);
  };

  const playSample = async (mode) => {
    if (playing) {
      const wasSame = playing === mode;
      stopSample();
      if (wasSame) return;
    }
    const engine = mode === 'en' ? s.enTts : s.koTts;
    setPlaying(mode);

    // 기기 음성 샘플
    if (engine === 'device') {
      const u = new SpeechSynthesisUtterance(mode === 'en' ? SAMPLE_EN : SAMPLE_KO);
      u.lang = mode === 'en' ? 'en-US' : 'ko-KR';
      u.rate = 0.95;
      u.onend = () => setPlaying(null);
      window.speechSynthesis?.speak(u);
      return;
    }

    // API 음성 샘플
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: mode === 'en' ? SAMPLE_EN : SAMPLE_KO,
          mode,
          provider: engine,
          voice: engine === 'google' ? s.googleVoice : s.ttsVoice,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || '샘플 재생에 실패했어요. 환경변수 설정을 확인해 주세요.');
        setPlaying(null);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setPlaying(null);
      };
      await audio.play();
    } catch {
      setPlaying(null);
    }
  };

  const Sel = ({ label, field, options }) => (
    <div>
      <label className="field">{label}</label>
      <select
        className="input"
        value={s[field]}
        onChange={(e) => update({ [field]: isNaN(+e.target.value) ? e.target.value : +e.target.value })}
      >
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="wrap">
      <div className="top">
        <a href="/" className="title">← 엄마 설정</a>
        {saved && <span className="badge" style={{ background: 'var(--grass)' }}>저장됨 ✓</span>}
      </div>
      <p className="sub">설정은 다음 대화부터 바로 적용돼요. 레벨은 한 번에 한 단계씩만 올리는 걸 추천해요.</p>

      <div className="card stack" style={{ gap: 4 }}>
        <Sel
          label="사고 질문 레벨"
          field="think"
          options={[
            [1, 'Lv.1 — 관찰과 단순 원인'],
            [2, 'Lv.2 — 원인·의도·근거·예측 (기본)'],
            [3, 'Lv.3 — 관점 비교·주장과 근거'],
            [4, 'Lv.4 — 작가 의도·반론·가설'],
          ]}
        />
        <Sel
          label="한글 표현 레벨"
          field="ko"
          options={[
            [1, 'K1 — 한 단어·선택형·문장 틀'],
            [2, 'K2 — 한 문장 + 왜냐하면 (기본)'],
            [3, 'K3 — 두세 문장·비교'],
            [4, 'K4 — 의견 정리·재구성'],
          ]}
        />
        <Sel
          label="영어 표현 레벨"
          field="en"
          options={[
            [1, 'E1 — 한 단어·선택형 (기본)'],
            [2, 'E2 — 주어+동사 짧은 문장'],
            [3, 'E3 — 두 문장 연결·순서'],
            [4, 'E4 — 의견·간단한 토론'],
          ]}
        />
        <Sel
          label="🎤 음성 인식 방식"
          field="stt"
          options={[
            ['auto', '자동 — 아이폰은 정확 인식, 그 외 브라우저 인식 (기본)'],
            ['web', '브라우저 인식 — 빠르고 실시간 자막, 안드로이드 크롬 최적'],
            ['whisper', '정확 인식(AI 전사) — 아이폰 권장, 자막은 말이 끝난 뒤'],
          ]}
        />
        <Sel
          label="기본 진행 방식"
          field="depth"
          options={[
            ['short', '오늘 짧게 — 3단계'],
            ['normal', '보통 — 5단계 (기본)'],
            ['deep', '오늘 깊게 — 근거·관점 확장'],
          ]}
        />
      </div>

      <div className="card stack" style={{ gap: 4, marginTop: 14 }}>
        <strong className="display" style={{ fontSize: 18 }}>🔊 목소리 (하이브리드)</strong>
        <p className="sub" style={{ margin: '2px 0 6px', fontSize: 13 }}>
          한글책과 영어책의 목소리 엔진을 따로 골라요. 한국어는 Google, 영어는 OpenAI 조합을 추천해요.
        </p>

        <Sel
          label="📖 한글책 목소리"
          field="koTts"
          options={[
            ['device', '기기 음성 — 무료'],
            ['google', 'Google 한국어 음성 — 한국어 발음 최고 (추천)'],
            ['openai', 'OpenAI 음성 — 감정 표현 풍부'],
          ]}
        />
        {s.koTts === 'google' && (
          <Sel label="Google 한국어 목소리" field="googleVoice" options={GOOGLE_VOICES} />
        )}

        <Sel
          label="🔤 영어책 목소리"
          field="enTts"
          options={[
            ['device', '기기 음성 — 무료'],
            ['openai', 'OpenAI 음성 — 원어민급 (추천)'],
          ]}
        />
        {(s.enTts === 'openai' || s.koTts === 'openai') && (
          <Sel label="OpenAI 목소리" field="ttsVoice" options={OPENAI_VOICES} />
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" style={{ fontSize: 17, padding: '13px 10px' }} onClick={() => playSample('ko')}>
            {playing === 'ko' ? '⏹ 정지' : '▶ 한글책 들어보기'}
          </button>
          <button className="btn" style={{ fontSize: 17, padding: '13px 10px' }} onClick={() => playSample('en')}>
            {playing === 'en' ? '⏹ 정지' : '▶ 영어책 들어보기'}
          </button>
        </div>
        <p className="sub" style={{ margin: '8px 0 0', fontSize: 13 }}>
          Google 음성은 GOOGLE_TTS_API_KEY 환경변수가 필요해요 (README 참고). API 호출이 실패하면
          자동으로 다른 음성으로 대신 읽어줘요.
        </p>
      </div>

      <p className="sub" style={{ marginTop: 16 }}>
        💡 대화 중에 마이크로 “오늘은 선택형 질문 많이 해줘”, “영어는 한 단어 대답도 받아줘”처럼 엄마가 직접
        말해도 즉시 반영돼요.
      </p>

      <div style={{ flex: 1 }} />
      <a href="/records">
        <button className="btn">📒 독서 기록 보기</button>
      </a>
    </div>
  );
}
