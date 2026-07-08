// 책 검색 API
// 1순위: 네이버 책 검색 (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수 필요, 한국 책에 최적)
// 2순위: Google Books (키 불필요, 자동 폴백)

function strip(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}

export async function POST(req) {
  try {
    const { title, extra } = await req.json();
    const q = [title, extra].filter(Boolean).join(' ').trim();
    if (!q) return Response.json({ results: [] });

    // ---- 네이버 책 검색 ----
    if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
      const res = await fetch(
        `https://openapi.naver.com/v1/search/book.json?query=${encodeURIComponent(q)}&display=6`,
        {
          headers: {
            'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
            'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const results = (data.items || []).map((b) => ({
          title: strip(b.title),
          author: strip(b.author),
          publisher: strip(b.publisher),
          description: strip(b.description),
          thumbnail: b.image || '',
          source: 'naver',
        }));
        if (results.length) return Response.json({ results });
      }
    }

    // ---- Google Books 폴백 ----
    const g = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=6`
    );
    if (!g.ok) return Response.json({ results: [] });
    const gd = await g.json();
    const results = (gd.items || []).map((it) => {
      const v = it.volumeInfo || {};
      return {
        title: v.title || '',
        author: (v.authors || []).join(', '),
        publisher: v.publisher || '',
        description: (v.description || '').slice(0, 1500),
        thumbnail: v.imageLinks?.thumbnail || '',
        source: 'google',
      };
    });
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: String(e?.message || e), results: [] }, { status: 500 });
  }
}
