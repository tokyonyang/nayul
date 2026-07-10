// 연계독서 추천 API — 서재 목록 + 최근 독서 기록을 바탕으로 추천
export async function POST(req) {
  try {
    const { books, records } = await req.json();
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: 'OPENAI_API_KEY가 설정되지 않았어요.' }, { status: 500 });
    }

    const bookList = (books || [])
      .slice(0, 80)
      .map((b, i) => `${i + 1}. ${b.title}${b.author ? ` / ${b.author}` : ''}${b.publisher ? ` / ${b.publisher}` : ''}${b.description ? ` — ${b.description.slice(0, 120)}` : ''}${b.transcript && b.transcript.length > 100 ? ' [읽어준 기록 있음]' : ''}`)
      .join('\n');

    const recent = (records || [])
      .slice(0, 8)
      .map((r) => `- ${r.book_title} (${r.language_mode || ''}) 강점: ${r.strengths || ''} / 다음 목표: ${r.next_goal || ''}`)
      .join('\n');

    const system = `너는 5세 남자아이 나율이의 독서 코치다. 나율이 프로필: 사고력은 7세 수준, 언어 표현은 5세 수준. 관심사: 자동차, 2층버스, 정비소와 타이어, 로봇, 톱니바퀴, 엔진과 기계, 구조물과 터널, 블록, 동물과 자연, 실험, 음악. 하브루타식 독서(관찰→이유→근거→다른 관점→삶과 연결)를 하고 있다.

연계독서를 다음 두 가지 축으로 나누어 추천한다. 두 축의 목적이 다르므로 조합 방식과 질문 유형도 다르게 설계한다.

【조직화 중심】 이미 알고 있는 주제·개념을 묶어 생각의 뼈대를 세우는 조합.
- 같은 주제나 인접 주제의 책 2~3권을 묶는다.
- 공통점과 차이점 비교, 분류하기, 부분과 전체, 원인과 결과 사슬, 순서 정리가 목적이다.
- 질문 예: "두 책의 버스는 어떤 점이 같고 어떤 점이 달랐어?", "이 세 가지를 빠른 순서로 세워볼까?"

【사고확장 중심】 익숙한 관심사에서 낯선 영역으로 다리를 놓는 조합.
- 나율이가 좋아하는 주제의 책 1권 + 장르나 영역이 다른 책 1~2권을 잇는다.
- 새로운 관점 취하기, 다른 영역으로의 전이, 상상과 가설 만들기가 목적이다.
- 질문 예: "톱니바퀴가 몸속에도 있다면 어디에 있을까?", "이 동물이 정비소에 온다면 무엇을 고쳐달라고 할까?"

우리집 서재 목록과 최근 독서 기록을 보고 아래 형식으로 답한다. 서재에 실제로 있는 책만 조합에 사용하고, 목록에 없는 책을 서재에 있는 것처럼 말하지 않는다. 과장 없이 간결하게.

형식:
[🧱 조직화 중심 연계독서 2가지]
각각: 📚 책 조합 (서재의 책 2~3권) → 묶는 기준 한 줄 (무엇을 비교·분류·구조화하는지) → 함께 읽은 뒤 던질 조직화 질문 1개

[🚀 사고확장 중심 연계독서 2가지]
각각: 📚 책 조합 (서재의 책 2~3권) → 어떤 다리를 놓는지 한 줄 (익숙한 것 → 새로운 것) → 함께 읽은 뒤 던질 확장 질문 1개

[새로 구하면 좋은 책]
조직화용 1권 + 사고확장용 1권. 각각: 제목 (저자/출판사 아는 경우만) → 서재의 어떤 책과 어떻게 이어지는지 한 줄. 실존하는 책만 추천하고 확실하지 않으면 "이런 주제의 책"으로 표현한다.

[한 줄 코치]
최근 기록 기반으로 다음 독서에서 시도할 것 한 가지.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `우리집 서재:\n${bookList || '(비어 있음)'}\n\n최근 독서 기록:\n${recent || '(없음)'}` },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `OpenAI 오류 (${res.status}): ${err.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();
    return Response.json({ text: data.choices?.[0]?.message?.content?.trim() || '' });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
