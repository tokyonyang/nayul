// 최소 서비스워커: PWA 설치 요건 충족용 (네트워크 우선)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
