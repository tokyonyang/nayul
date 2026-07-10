// 설정 클라이언트 — localStorage를 캐시로 쓰고 서버(Supabase)와 동기화
const LS_KEY = 'nayul_settings';

export const DEFAULT_SETTINGS = {
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

export function getLocalSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setLocalSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

// 앱 진입 시 호출: 서버 설정이 있으면 이 기기 캐시를 덮어씀
export async function syncSettingsFromServer() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (!data.disabled && data.settings) {
      const merged = { ...DEFAULT_SETTINGS, ...data.settings };
      setLocalSettings(merged);
      return merged;
    }
  } catch {}
  return getLocalSettings();
}

// 저장: 로컬 + 서버 (서버 미설정이면 로컬만)
export async function saveSettings(s) {
  const merged = { ...DEFAULT_SETTINGS, ...s };
  setLocalSettings(merged);
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    });
    const data = await res.json();
    if (data.disabled) return { ok: true, local: true };
    if (data.error) return { ok: false, error: data.error };
    return { ok: true };
  } catch (e) {
    return { ok: true, local: true };
  }
}
