'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { libSaveTranscript } from '../../lib/libraryClient';

const DEFAULT_SETTINGS = { think: 2, ko: 2, en: 1, depth: 'normal' };
const TRANSCRIPT_LIMIT = 15000; // 전사 최대 길이 (토큰 보호)

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('nayul_settings') || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/* ---------- TTS ----------
   엔진 1: OpenAI TTS (gpt-4o-mini-tts) — 설정에서 켜면 사용, 실패 시 기기 음성으로 자동 폴백
   엔진 2: 기기 음성 (speechSynthesis) — 문장별 한/영 음성 자동 선택 */

let currentAudio = null;

function stopAllSpeech() {
  try {
    window.speechSynthesis?.cancel();
  } catch {}
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {}
    currentAudio = null;
  }
}

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

function browserSpeak(text, onEnd) {
  const synth = window.speechSynthesis;
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

async function speak(text, { mode, settings } = {}) {
  stopAllSpeech();
  const s = settings || {};
  // 하이브리드: 한글책 모드와 영어책 모드의 엔진을 각각 설정
  const engine = mode === 'en' ? s.enTts || 'device' : s.koTts || 'device';
  const onEnd = undefined;
  if (engine === 'google' || engine === 'openai') {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          mode,
          provider: engine,
          voice: engine === 'google' ? s.googleVoice || 'ko-KR-Chirp3-HD-Aoede' : s.ttsVoice || 'marin',
        }),
      });
      if (!res.ok) throw new Error('tts failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        onEnd && onEnd();
      };
      await audio.play();
      return;
    } catch {
      // API TTS 실패 → 기기 음성으로 폴백
    }
  }
  browserSpeak(text, onEnd);
}

function getSR() {
  return typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;
}

function SessionInner() {
  const params = useSearchParams();
  const mode = params.get('mode') === 'en' ? 'en' : 'ko';
  const bookTitle = params.get('book') || '';

  const [phase, setPhase] = useState('reading'); // reading | talk | ended
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [bookInfo, setBookInfo] = useState(null);
  const [messages, setMessages] = useState([]);
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
  const noContentRef = useRef(true); // 책 내용 정보(소개/저장 전사/이번 전사) 유무

  // ----- 같이 듣기 (읽어주기 전사) -----
  const [earOn, setEarOn] = useState(false);
  const [earSupported, setEarSupported] = useState(true);
  const [liveHeard, setLiveHeard] = useState('');
  const transcriptRef = useRef('');
  const earRecRef = useRef(null);
  const earActiveRef = useRef(false);

  useEffect(() => {
    setSettings(loadSettings());
    window.speechSynthesis?.getVoices();
    if (!getSR()) setEarSupported(false);
    try {
      const b = sessionStorage.getItem('nayul_book');
      if (b) setBookInfo(JSON.parse(b));
    } catch {}
    return () => {
      stopAllSpeech();
      stopEar();
      releaseMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, interim]);

  // ----- 마이크 권한을 세션 동안 유지 (권한 재요청 방지) -----
  const micStreamRef = useRef(null);
  const holdMicPermission = async () => {
    if (micStreamRef.current) return true;
    try {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch {
      return false;
    }
  };
  const releaseMic = () => {
    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    micStreamRef.current = null;
  };

  const startEar = async () => {
    const SR = getSR();
    if (!SR) {
      setEarSupported(false);
      return;
    }
    const ok = await holdMicPermission();
    if (!ok) {
      alert('마이크 권한이 필요해요. 브라우저 권한 요청에서 "허용"(앱 사용 중 허용)을 선택해 주세요.');
      return;
    }
    earActiveRef.current = true;
    setEarOn(true);
    const run = () => {
      if (!earActiveRef.current) return;
      const rec = new SR();
      earRecRef.current = rec;
      rec.lang = mode === 'en' ? 'en-US' : 'ko-KR';
      rec.continuous = true;
      rec.interimResults = true;
      // 안드로이드 크롬은 결과 이벤트가 누적 전체를 반복 전달하므로
      // 이어붙이지 않고 인스턴스별 최종문을 매번 다시 조립한다 (중복 방지)
      let instFinal = '';
      rec.onresult = (e) => {
        let fin = '';
        let interimText = '';
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) fin += r[0].transcript + ' ';
          else interimText += r[0].transcript;
        }
        instFinal = fin;
        const full = (transcriptRef.current + ' ' + instFinal + ' ' + interimText).trim();
        setLiveHeard(full.slice(-70));
      };
      rec.onend = () => {
        const seg = instFinal.trim();
        instFinal = '';
        if (seg) {
          // 재시작 직후 같은 구간이 그대로 다시 오는 경우 방지
          if (!transcriptRef.current.trim().endsWith(seg)) {
            transcriptRef.current = (transcriptRef.current + ' ' + seg).trim();
          }
          if (transcriptRef.current.length > TRANSCRIPT_LIMIT + 3000) {
            transcriptRef.current = transcriptRef.current.slice(-TRANSCRIPT_LIMIT);
          }
        }
        if (earActiveRef.current) setTimeout(run, 250);
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          earActiveRef.current = false;
          setEarOn(false);
          setEarSupported(false);
        }
      };
      try {
        rec.start();
      } catch {}
    };
    run();
  };

  const stopEar = () => {
    earActiveRef.current = false;
    setEarOn(false);
    try {
      earRecRef.current?.stop();
    } catch {}
  };

  // ----- 대화 -----
  const callChat = async (history) => {
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history,
          mode,
          bookTitle,
          bookInfo,
          noContentInfo: noContentRef.current,
          settings: loadSettings(),
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages((m) => [...m, { role: 'sys', content: `⚠️ ${data.error}` }]);
        return;
      }
      setMessages((m) => [...m, { role: 'assistant', content: data.text }]);
      speak(data.text, { mode, settings: loadSettings() });
    } catch (e) {
      setMessages((m) => [...m, { role: 'sys', content: `⚠️ 연결에 문제가 있어요: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const historyForApi = (msgs) => msgs.filter((m) => m.role === 'user' || m.role === 'assistant');

  const finishReading = () => {
    stopEar();
    holdMicPermission();
    setPhase('talk');
    const heard = transcriptRef.current.trim().slice(-TRANSCRIPT_LIMIT);
    noContentRef.current =
      heard.length <= 200 &&
      !(bookInfo?.description && bookInfo.description.length > 50) &&
      !(bookInfo?.savedTranscript && bookInfo.savedTranscript.length > 200);
    // 서재 책이면 전사를 자동 저장 → 다음번엔 읽지 않아도 내용을 기억
    if (heard.length > 200 && bookInfo?.libraryId) {
      libSaveTranscript(bookInfo.libraryId, heard).catch(() => {});
    }
    let content =
      mode === 'en' ? 'We finished the book. Now you can talk.' : '책 다 읽었어. 이제 이야기해도 돼.';
    if (heard.length > 30) {
      content += `\n\n[앱 자동 첨부: 엄마가 방금 소리 내어 읽어준 내용의 음성 인식 전사. 인식 오류가 섞여 있을 수 있으니 문맥으로 이해하고, 이 내용을 책의 실제 내용으로 사용해 질문할 것]\n${heard}`;
    }
    const msgs = [{ role: 'user', content }];
    setMessages(msgs);
    callChat(msgs);
  };

  const skipReading = () => {
    stopEar();
    holdMicPermission();
    setPhase('talk');
    const saved = (bookInfo?.savedTranscript || '').trim();
    noContentRef.current = saved.length <= 200 && !(bookInfo?.description && bookInfo.description.length > 50);
    let content =
      mode === 'en'
        ? 'We already know this book well. Please start the havruta talk based on the known book content.'
        : '이 책은 우리가 이미 잘 아는 책이야. 알고 있는 책 내용을 바탕으로 바로 하브루타 대화를 시작해 줘.';
    if (saved.length > 200) {
      content += `\n\n[앱 자동 첨부: 지난 독서에서 엄마가 읽어준 내용의 음성 전사. 이것을 책의 실제 내용으로 사용]\n${saved.slice(-TRANSCRIPT_LIMIT)}`;
    }
    const msgs = [{ role: 'user', content }];
    setMessages(msgs);
    callChat(msgs);
  };

  const send = (text) => {
    const t = text.trim();
    if (!t || busy) return;
    stopAllSpeech();
    const msgs = [...messages, { role: 'user', content: t }];
    setMessages(msgs);
    callChat(historyForApi(msgs));
  };

  // ----- 아이 말하기 STT -----
  // 아이가 말 중간에 뜸을 들여도 끊기지 않도록:
  // 자동 재시작(전송 안 함) + 세그먼트 누적. 안드로이드 크롬의 결과 중복 버그에 대응해
  // 이어붙이지 않고 인스턴스별로 매번 다시 조립한다.
  // 전송은 (1) 버튼을 다시 눌렀을 때 또는 (2) 말한 내용이 있고 7초간 완전 침묵일 때.
  const talkActiveRef = useRef(false);
  const talkSegmentsRef = useRef([]); // 확정된 세그먼트들
  const talkInstFinalRef = useRef(''); // 현재 인스턴스의 최종문 (매 이벤트 재조립)
  const pendingSendRef = useRef(false);
  const silenceTimerRef = useRef(null);
  const SILENCE_SEND_MS = 7000;

  const talkText = () =>
    (talkSegmentsRef.current.join(' ') + ' ' + talkInstFinalRef.current).replace(/\s+/g, ' ').trim();

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const armSilenceTimer = () => {
    clearSilenceTimer();
    if (!talkText()) return; // 아직 아무 말도 없으면 자동 전송 안 함
    silenceTimerRef.current = setTimeout(() => {
      if (talkActiveRef.current) stopListening();
    }, SILENCE_SEND_MS);
  };

  const flushSend = () => {
    const finalText = talkText();
    talkSegmentsRef.current = [];
    talkInstFinalRef.current = '';
    pendingSendRef.current = false;
    setListening(false);
    setInterim('');
    if (finalText) send(finalText);
  };

  const startListening = async () => {
    if (busy) return;
    stopAllSpeech();
    const SR = getSR();
    if (!SR) {
      alert('이 브라우저는 음성 인식을 지원하지 않아요. 크롬(안드로이드)이나 사파리(아이폰)에서 열어 주세요. 키보드 입력으로 대신할 수 있어요.');
      setTypedMode(true);
      return;
    }
    // 권한을 세션 동안 붙잡아 재요청 방지. "이번만 허용" 말고 "허용"을 선택해야 안 뜸.
    const ok = await holdMicPermission();
    if (!ok) {
      alert('마이크 권한이 필요해요. 권한 요청이 계속 뜬다면 "이번만"이 아니라 "앱 사용 중 허용"을 선택해 주세요.');
      return;
    }
    talkActiveRef.current = true;
    talkSegmentsRef.current = [];
    talkInstFinalRef.current = '';
    pendingSendRef.current = false;
    setListening(true);
    setInterim('');

    const run = () => {
      if (!talkActiveRef.current) return;
      const rec = new SR();
      recRef.current = rec;
      rec.lang = listenLang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let fin = '';
        let interimText = '';
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) fin += r[0].transcript + ' ';
          else interimText += r[0].transcript;
        }
        talkInstFinalRef.current = fin; // 재조립 (누적 아님 → 중복 불가)
        setInterim((talkText() + ' ' + interimText).replace(/\s+/g, ' ').trim());
        armSilenceTimer();
      };
      rec.onend = () => {
        // 인스턴스 종료 → 최종문을 세그먼트로 확정 (직전 세그먼트와 같으면 중복으로 보고 버림)
        const seg = talkInstFinalRef.current.trim();
        talkInstFinalRef.current = '';
        if (seg && talkSegmentsRef.current[talkSegmentsRef.current.length - 1] !== seg) {
          talkSegmentsRef.current.push(seg);
        }
        if (pendingSendRef.current) {
          flushSend();
          return;
        }
        // 침묵/타임아웃으로 끊긴 경우 → 전송하지 않고 조용히 다시 듣는다
        if (talkActiveRef.current) setTimeout(run, 200);
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          talkActiveRef.current = false;
          clearSilenceTimer();
          setListening(false);
          setInterim('');
          setTypedMode(true);
        }
        // 'no-speech' 등은 onend에서 자동 재시작으로 이어짐
      };
      try {
        rec.start();
      } catch {}
    };
    run();
  };

  const stopListening = () => {
    talkActiveRef.current = false;
    clearSilenceTimer();
    pendingSendRef.current = true;
    try {
      recRef.current?.stop(); // onend에서 마지막 세그먼트 확정 후 flushSend
    } catch {
      flushSend();
    }
    // onend가 오지 않는 브라우저 대비 안전장치
    setTimeout(() => {
      if (pendingSendRef.current) flushSend();
    }, 700);
  };

  // ----- 종료 & 피드백 -----
  const endSession = () => {
    stopAllSpeech();
    talkActiveRef.current = false;
    clearSilenceTimer();
    pendingSendRef.current = false;
    talkSegmentsRef.current = [];
    talkInstFinalRef.current = '';
    try {
      recRef.current?.stop();
    } catch {}
    releaseMic();
    setListening(false);
    setInterim('');
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
        <div className="readingArt">{earOn ? '👂📖' : '🤫📖'}</div>
        <h1 className="center">{bookTitle || '오늘의 책'}</h1>
        {bookInfo && (
          <p className="sub center" style={{ marginTop: -2 }}>
            {[bookInfo.author, bookInfo.publisher].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className="sub center">
          엄마가 책을 읽어주는 시간이에요.
          <br />
          {earSupported
            ? '아래 귀 버튼을 켜면 AI가 함께 들어요!'
            : '이 브라우저는 같이 듣기를 지원하지 않아요.'}
        </p>

        {!(bookInfo?.description?.length > 50) && !(bookInfo?.savedTranscript?.length > 200) && (
          <div
            className="card center"
            style={{ marginBottom: 10, background: '#FFF3D6', border: '2px solid var(--bus-deep)' }}
          >
            <strong style={{ fontSize: 15 }}>📕 아직 내용 정보가 없는 책이에요</strong>
            <p className="sub" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
              전집(프뢰벨 등)은 검색이 안 되는 경우가 많아요. 👂 같이 듣기를 꼭 켜주세요 — 한 번만 들으면
              다음부터는 내용을 기억해요! (안 켜도 AI가 나율이의 대답을 따라가며 안전하게 질문해요)
            </p>
          </div>
        )}
        {earSupported && (
          <div className="card center" style={{ marginBottom: 14 }}>
            <button className={`btn ${earOn ? 'red' : 'green'}`} onClick={earOn ? stopEar : startEar}>
              {earOn ? '👂 듣는 중… (탭하면 멈춤)' : '👂 같이 듣기 시작'}
            </button>
            {earOn && (
              <p className="sub" style={{ margin: '10px 0 0', minHeight: 20, fontStyle: 'italic' }}>
                {liveHeard ? `…${liveHeard}` : '조용히 귀 기울이고 있어요'}
              </p>
            )}
            {!earOn && transcriptRef.current.length > 30 && (
              <p className="sub" style={{ margin: '10px 0 0' }}>
                지금까지 {transcriptRef.current.length}자를 들었어요 ✓
              </p>
            )}
          </div>
        )}

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
        <div className="stack">
          <button className="btn big yellow" onClick={finishReading}>
            다 읽었어! 이제 얘기하자 🎉
          </button>
          {((bookInfo?.description && bookInfo.description.length > 50) ||
            (bookInfo?.savedTranscript && bookInfo.savedTranscript.length > 200)) && (
            <button className="btn" onClick={skipReading}>
              {bookInfo?.savedTranscript && bookInfo.savedTranscript.length > 200
                ? '👂 지난번 읽은 내용 기억해요 — 바로 이야기'
                : '⏭️ 이미 잘 아는 책 — 읽기 없이 바로 이야기'}
            </button>
          )}
        </div>
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
              <button className={`chip ${listenLang === 'en-US' ? 'on' : ''}`} onClick={() => setListenLang('en-US')}>
                🎧 English
              </button>
              <button className={`chip ${listenLang === 'ko-KR' ? 'on' : ''}`} onClick={() => setListenLang('ko-KR')}>
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
                {listening
                  ? '듣는 중이에요 — 천천히 말해도 괜찮아요. 다 말하면 버튼을 눌러 주세요!'
                  : busy
                  ? '생각하는 중…'
                  : '버튼을 누르고 말해 보세요'}
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
