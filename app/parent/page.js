'use client';

import { useEffect, useState } from 'react';

const DEFAULTS = { think: 2, ko: 2, en: 1, depth: 'normal' };

export default function ParentPage() {
  const [s, setS] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      setS({ ...DEFAULTS, ...JSON.parse(localStorage.getItem('nayul_settings') || '{}') });
    } catch {}
  }, []);

  const update = (patch) => {
    const next = { ...s, ...patch };
    setS(next);
    localStorage.setItem('nayul_settings', JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  const Sel = ({ label, field, options }) => (
    <div>
      <label className="field">{label}</label>
      <select className="input" value={s[field]} onChange={(e) => update({ [field]: isNaN(+e.target.value) ? e.target.value : +e.target.value })}>
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
          label="기본 진행 방식"
          field="depth"
          options={[
            ['short', '오늘 짧게 — 3단계'],
            ['normal', '보통 — 5단계 (기본)'],
            ['deep', '오늘 깊게 — 근거·관점 확장'],
          ]}
        />
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
