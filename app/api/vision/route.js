// 책장 사진 → 책 제목 추출 (Vision)
// POST { image: dataURL } → { titles: ["제목", "제목 / 출판사", ...] }

export async function POST(req) {
  try {
    const { image, images, task } = await req.json();
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: 'OPENAI_API_KEY가 설정되지 않았어요.' }, { status: 500 });
    }
    const imageList = Array.isArray(images) ? images : image ? [image] : [];
    if (!imageList.length || imageList.some((im) => !im.startsWith('data:image'))) {
      return Response.json({ error: '이미지가 올바르지 않아요.' }, { status: 400 });
    }

    const pagesPrompt = `이 사진들은 보호자가 소장한 어린이 책의 본문 장면들이다. 아이의 독서 대화(하브루타)를 돕기 위한 개인용 책 소개를 만든다.

규칙:
- 사진 속 글과 그림에서 확인되는 내용만 사용한다. 사진에 없는 내용을 지어내지 않는다.
- 사진이 책의 일부만 담고 있을 수 있다. 확인된 범위만 정리하고, 결말이 안 보이면 결말을 추측하지 않는다.
- 본문 문장을 길게 그대로 옮겨 적지 않는다. 반드시 요약된 소개 형태로 정리한다.
- 구성: 줄거리 요약 4~6문장 + 주요 등장인물 + 아이와 이야기할 만한 핵심 장면 2~3개.
- 제목이나 출판사가 보이면 함께 추출한다.

반드시 아래 JSON 형식으로만 답한다:
{"title": "책 제목 또는 빈 문자열", "publisher": "출판사 또는 빈 문자열", "summary": "줄거리 요약. 등장인물: ... 핵심 장면: ..."}`;

    const blurbPrompt = `이 사진은 어린이 책의 표지 또는 뒷표지다. 사진에 보이는 텍스트를 바탕으로 이 책의 소개를 만들어라.

규칙:
- 뒷표지의 줄거리 소개, 추천사, 시리즈 설명 등 실제로 적힌 내용만 사용한다. 사진에 없는 내용을 지어내지 않는다.
- 3~5문장의 간결한 책 소개로 정리한다 (줄거리 중심).
- 제목과 출판사가 보이면 함께 추출한다.
- 텍스트가 너무 적어 소개를 만들 수 없으면 보이는 정보만 담는다.

반드시 아래 JSON 형식으로만 답한다:
{"title": "책 제목 또는 빈 문자열", "publisher": "출판사 또는 빈 문자열", "summary": "책 소개"}`;

    const shelfPrompt = `이 사진은 아이 책장의 책들이다. 사진에 보이는 모든 책의 제목을 추출하라.

규칙:
- 책등(세로로 꽂힌 책)과 표지가 보이는 책 모두 포함한다.
- 제목이 부분적으로 가려져 있어도 확실히 읽히는 부분으로 판단 가능하면 포함한다.
- 글자가 흐릿하거나 확신이 없는 책은 제외한다. 추측으로 만들어내지 않는다.
- 출판사나 시리즈명이 함께 보이면 "제목 / 출판사" 형식으로 쓴다. 안 보이면 제목만.
- 같은 책이 여러 권 보여도 한 번만 쓴다.
- 한국어 책은 한국어로, 영어 책은 영어로 그대로 쓴다.
- 장난감, 소품, 책이 아닌 물건은 무시한다.

반드시 아래 JSON 형식으로만 답한다:
{"titles": ["제목1", "제목2 / 출판사", ...]}`;

    const prompt = task === 'pages' ? pagesPrompt : task === 'blurb' ? blurbPrompt : shelfPrompt;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        messages: [
          {
            role: 'user',
            content: [
              ...imageList.slice(0, 6).map((im) => ({
                type: 'image_url',
                image_url: { url: im, detail: 'high' },
              })),
              { type: 'text', text: prompt },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Vision 오류 (${res.status}): ${err.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    let parsed = {};
    try {
      parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    } catch {}
    if (task === 'blurb' || task === 'pages') {
      return Response.json({
        title: parsed.title || '',
        publisher: parsed.publisher || '',
        summary: parsed.summary || '',
      });
    }
    const titles = Array.isArray(parsed.titles)
      ? parsed.titles.filter((t) => typeof t === 'string' && t.trim())
      : [];
    return Response.json({ titles });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
