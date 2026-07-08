'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState('');

  const start = (mode) => {
    const q = new URLSearchParams({ mode });
    if (title.trim()) q.set('book', title.trim());
    router.push(`/session?${q.toString()}`);
  };

  const parentGate = (path) => {
    const a = Math.floor(Math.random() * 5) + 4;
    const b = Math.floor(Math.random() * 5) + 3;
    const ans = prompt(`엄마 확인 문제예요!\n${a} × ${b} = ?`);
    if (ans !== null && parseInt(ans, 10) === a * b) router.push(path);
    else if (ans !== null) alert('다시 확인해 주세요.');
  };

  return (
    <div className="wrap">
      <div style={{ fontSize: 54, textAlign: 'center', marginTop: 18 }}>🚌📚</div>
      <h1 className="center">나율이의 하브루타</h1>
      <p className="sub center">오늘은 어떤 책을 읽었어?</p>

      <div className="stack" style={{ flex: 1 }}>
        <input
          className="input"
          placeholder="책 제목 (안 써도 괜찮아요)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn big yellow" onClick={() => start('ko')}>
          📖 한글책 이야기하기
        </button>
        <button className="btn big" onClick={() => start('en')}>
          🔤 English Book!
        </button>
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
        <button className="btn ghost" onClick={() => parentGate('/records')}>
          📒 독서 기록
        </button>
        <button className="btn ghost" onClick={() => parentGate('/parent')}>
          ⚙️ 엄마 설정
        </button>
      </div>
    </div>
  );
}
