'use client';

import { useEffect, useState } from 'react';

export default function RecordsPage() {
  const [records, setRecords] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/records');
        const data = await res.json();
        if (data.disabled) {
          setNote('이 기기에 저장된 기록이에요. (Supabase 연결 시 서버 기록으로 전환)');
          setRecords(JSON.parse(localStorage.getItem('nayul_records') || '[]'));
        } else if (data.error) {
          setNote(`⚠️ ${data.error}`);
          setRecords([]);
        } else {
          setRecords(data.records || []);
        }
      } catch (e) {
        setNote(`⚠️ ${e.message}`);
        setRecords([]);
      }
    })();
  }, []);

  return (
    <div className="wrap">
      <div className="top">
        <a href="/" className="title">← 독서 기록</a>
      </div>
      {note && <p className="sub">{note}</p>}

      {records === null && (
        <p className="center" style={{ marginTop: 40 }}>
          <span className="spin" />
        </p>
      )}

      {records && records.length === 0 && (
        <div className="card center" style={{ marginTop: 20 }}>
          아직 기록이 없어요.
          <br />
          대화가 끝난 뒤 “엄마 피드백 + 기록 저장”을 눌러 보세요!
        </div>
      )}

      <div className="stack">
        {records &&
          records.map((r, i) => (
            <div className="card" key={r.id || i}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong className="display" style={{ fontSize: 18 }}>
                  {r.book_title || '(제목 없음)'}
                </strong>
                <span className="badge">{r.language_mode}</span>
              </div>
              <p className="sub" style={{ margin: '4px 0 10px' }}>
                {r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : ''} · {r.book_type}
              </p>
              {r.memorable_quotes && (
                <p style={{ margin: '0 0 8px', fontSize: 15 }}>💬 “{r.memorable_quotes}”</p>
              )}
              <p style={{ margin: '0 0 6px', fontSize: 15 }}>🌟 {r.strengths}</p>
              <p style={{ margin: '0 0 6px', fontSize: 15 }}>🎯 다음 목표: {r.next_goal}</p>
              <p style={{ margin: 0, fontSize: 15 }}>❓ 다음 질문: {r.next_question}</p>
            </div>
          ))}
      </div>
    </div>
  );
}
