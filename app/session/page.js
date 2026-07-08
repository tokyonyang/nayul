'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const DEFAULT_SETTINGS = { think: 2, ko: 2, en: 1, depth: 'normal' };

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('nayul_settings') || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/* ---------- TTS: 문장별 언어 감지 후 한/영 음성 자동 선택 ---------- */
function splitSentences(text) {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?…。])\s+/)
    .flatMap((s) => (s.length > 120 ? s.split(/(?<=,)\s+/) : [s]))
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
  const prefer = exact.find((v) => /google|natural|premium|siri/i.test(v.name));
  return prefer || exact[0] || null;
}

function speak(text, onEnd) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const parts = splitSentences(text);
  if (!parts.length) return onEnd && onEnd();
  let i = 0;
  const next = () => {
    if (i >= parts.length) return onEnd && onEnd();
    const part = parts[i++];
    const isKo = /[가-힣]/.test(part);
    const u = new SpeechSynthesisUtterance(part);
    u.lang = isKo ? 'ko-KR' : 'en-US';
    const v = pickVoice(isKo ? 'ko' : 'en');
    if (v) u.voice = v;
    u.rate = 0.95;
    u.pitch = 1.05;
    u.onend = next;
    u.onerror = next;
    synth.speak(u);
  };
  next();
}

function SessionInner() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get('mode') === 'en' ? 'en' : 'ko';
  const bookTitle = params.get('book') || '';

  const [phase, setPhase] = useState('reading'); // reading | talk | ended
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState([]); // {role, content}
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [listenLang, setListenLang] = useState(mode === 'en' ? 'en-US' : 'ko-KR');
  const [typedMode, setTypedMode] = useState(false);
  const [typed, setTyped] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [saveNote, setSaveNote] = useState('');
  const recRef = useRef(null);
  const chatRef = useRef(null);

  useEffect(() => {
    setSettings(loadSettings());
    // 일부 브라우저는 voices를 늦게 로드
    window.speechSynthesis?.getVoices();
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, interim]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const callChat = async (history) => {
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, mode, bookTitle, settings: loadSettings() }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages((m) => [...m, { role: 'sys', content: `⚠️ ${data.error}` }]);
        return;
      }
      setMessages((m) => [...m, { role: 'assistant', content: data.text }]);
      speak(data.text);
    } catch (e) {
      setMessages((m) => [...m, { role: 'sys', content: `⚠️ 연결에 문제가 있어요: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const historyForApi = (msgs) => msgs.filter((m) => m.role === 'user' || m.role === 'assistant');

  const finishReading = () => {
    setPhase('talk');
    const first = {
      role: 'user',
      content: mode === 'en' ? 'We finished the book. Now you can talk.' : '책 다 읽었어. 이제 이야기해도 돼.',
    };
    const msgs = [first];
    setMessages(msgs);
    callChat(msgs);
  };

  const send = (text) => {
    const t = text.trim();
    if (!t || busy) return;
    window.speechSynthesis?.cancel();
    const msgs = [...messages, { role: 'user', content: t }];
    setMessages(msgs);
    callChat(historyForApi(msgs));
  };

  /* ---------- STT ---------- */
  const startListening = () => {
    if (busy) return;
    window.speechSynthesis?.cancel();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('이 브라우저는 음성 인식을 지원하지 않아요. 크롬(안드로이드)이나 사파리(아이폰)에서 열어 주세요. 키보드 입력으로 대신할 수 있어요.');
      setTypedMode(true);
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = listenLang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText || finalText);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
      if (finalText.trim()) send(finalText);
    };
    rec.onerror = () => {
      setListening(false);
      setInterim('');
    };
    setListening(true);
    rec.start();
  };

  const stopListening = () => {
    recRef.current?.stop();
  };

  /* ---------- 종료 & 피드백 ---------- */
  const endSession = () => {
    window.speechSynthesis?.cancel();
    recRef.current?.stop();
    const msgs = [
      ...messages,
      { role: 'user', content: '엄마: 오늘은 여기까지 할게. 나율이에게 부드럽게 짧은 마무리 인사를 해줘.' },
    ];
    setMessages(msgs);
    setPhase('ended');
    callChat(historyForApi(msgs));
  };

  const getFeedback = async () => {
    setBusy(true);
    setSaveNote('');
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: historyForApi(messages), mode, bookTitle, settings: loadSettings() }),
      });
      const data = await res.json();
      if (data.error) {
        setSaveNote(`⚠️ ${data.error}`);
        return;
      }
      setFeedback(data.feedback || '');
      if (data.record) {
        const save = await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data.record),
        });
        const s = await save.json();
        if (s.disabled) {
          const local = JSON.parse(localStorage.getItem('nayul_records') || '[]');
          local.unshift({ ...data.record, created_at: new Date().toISOString() });
          localStorage.setItem('nayul_records', JSON.stringify(local.slice(0, 200)));
          setSaveNote('기록을 이 기기에 저장했어요. (Supabase 연결 시 서버에 저장됩니다)');
        } else if (s.error) {
          setSaveNote(`⚠️ ${s.error}`);
        } else {
          setSaveNote('독서 기록을 저장했어요. 📒');
        }
      }
    } catch (e) {
      setSaveNote(`⚠️ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const aiTurns = messages.filter((m) => m.role === 'assistant').length;
  const totalStages = settings.depth === 'short' ? 3 : 5;
  const stageGuess = Math.min(totalStages, Math.max(1, Math.ceil(aiTurns / 1.6)));

  const setDepth = (d) => {
    const s = { ...loadSettings(), depth: d };
    localStorage.setItem('nayul_settings', JSON.stringify(s));
    setSettings(s);
  };

  /* ================= RENDER ================= */

  if (phase === 'reading') {
    return (
      <div className="wrap">
        <div className="top">
          <a href="/" className="title">← 나율이의 하브루타</a>
          <span className="badge">{mode === 'en' ? 'English' : '한글책'}</span>
        </div>
        <div className="readingArt">🤫📖</div>
        <h1 className="center">{bookTitle || '오늘의 책'}</h1>
        <p className="sub center">
          엄마가 책을 읽어주는 시간이에요.
          <br />
          다 읽으면 아래 버튼을 눌러 주세요!
        </p>
        <div className="row" style={{ justifyContent: 'center', marginBottom: 20 }}>
          {[
            ['short', '오늘 짧게'],
            ['normal', '보통'],
            ['deep', '오늘 깊게'],
          ].map(([k, label]) => (
            <button key={k} className={`chip ${settings.depth === k ? 'on' : ''}`} onClick={() => setDepth(k)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn big yellow" onClick={finishReading}>
          다 읽었어! 이제 얘기하자 🎉
        </button>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="top">
        <a href="/" className="title">← {bookTitle || (mode === 'en' ? 'English Book' : '오늘의 책')}</a>
        <span className="badge">{mode === 'en' ? 'English' : '한글책'}</span>
      </div>

      <div className="dots" title="진행 단계 (엄마용)">
        {Array.from({ length: totalStages }).map((_, i) => (
          <span key={i} className={`dot ${i < stageGuess ? 'on' : ''}`} />
        ))}
      </div>

      <div className="chat" ref={chatRef}>
        {messages
          .filter((m) => m.role !== 'user' || !m.content.startsWith('엄마:'))
          .filter((m, i) => !(i === 0 && m.role === 'user'))
          .map((m, i) => (
            <div key={i} className={`bubble ${m.role === 'assistant' ? 'ai' : m.role === 'sys' ? 'sys' : 'me'}`}>
              {m.content}
            </div>
          ))}
        {interim && <div className="bubble me" style={{ opacity: 0.6 }}>{interim}</div>}
        {busy && (
          <div className="bubble ai">
            <span className="spin" />
          </div>
        )}
      </div>

      {phase === 'talk' && (
        <div className="micZone">
          {mode === 'en' && (
            <div className="row">
              <button
                className={`chip ${listenLang === 'en-US' ? 'on' : ''}`}
                onClick={() => setListenLang('en-US')}
              >
                🎧 English
              </button>
              <button
                className={`chip ${listenLang === 'ko-KR' ? 'on' : ''}`}
                onClick={() => setListenLang('ko-KR')}
              >
                🎧 한국어로 말할래
              </button>
            </div>
          )}

          {!typedMode ? (
            <>
              <button
                className={`mic ${listening ? 'listening' : busy ? 'busy' : ''}`}
                onClick={listening ? stopListening : startListening}
                disabled={busy}
                aria-label="말하기"
              >
                {listening ? '👂' : '🎤'}
              </button>
              <div className="micHint">
                {listening ? '듣고 있어요… 다 말하면 다시 눌러 주세요' : busy ? '생각하는 중…' : '버튼을 누르고 말해 보세요'}
              </div>
            </>
          ) : (
            <div className="row" style={{ width: '100%' }}>
              <input
                className="input"
                value={typed}
                placeholder="여기에 입력해 주세요"
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    send(typed);
                    setTyped('');
                  }
                }}
              />
              <button
                className="btn yellow"
                style={{ width: 'auto', padding: '13px 18px', fontSize: 17 }}
                onClick={() => {
                  send(typed);
                  setTyped('');
                }}
              >
                보내기
              </button>
            </div>
          )}

          <div className="row">
            <button className="btn ghost" onClick={() => setTypedMode((v) => !v)}>
              {typedMode ? '🎤 음성으로' : '⌨️ 키보드로'}
            </button>
            <button className="btn ghost" onClick={endSession}>
              🌙 오늘은 여기까지
            </button>
          </div>
        </div>
      )}

      {phase === 'ended' && (
        <div className="stack" style={{ paddingTop: 8 }}>
          {!feedback ? (
            <>
              <button className="btn green" onClick={getFeedback} disabled={busy}>
                {busy ? '정리하는 중…' : '👩 엄마 피드백 + 기록 저장'}
              </button>
              <a href="/">
                <button className="btn">🏠 홈으로</button>
              </a>
            </>
          ) : (
            <>
              <div className="card feedback">{feedback}</div>
              {saveNote && <p className="sub center" style={{ margin: 0 }}>{saveNote}</p>}
              <a href="/">
                <button className="btn yellow">🏠 홈으로</button>
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense>
      <SessionInner />
    </Suspense>
  );
}
