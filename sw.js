// ═══════════════════════════════════════════════════
//  Service Worker — 업무 스케줄러 알람
//  백그라운드에서 푸시 알림을 처리합니다.
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'scheduler-v2';

// ── 설치 ──
self.addEventListener('install', event => {
  self.skipWaiting();
});

// ── 활성화 ──
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ── 앱에서 메시지 수신 (알람 예약) ──
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  if (type === 'SCHEDULE_ALARM') {
    const { delay, alarm } = payload;
    // setTimeout을 SW에서 직접 쓰면 SW가 종료될 수 있으므로
    // 실제 발화는 클라이언트가 요청하거나, 여기서 짧은 delay는 처리
    setTimeout(() => {
      fireNotification(alarm);
    }, delay);
  }

  if (type === 'CANCEL_ALARMS') {
    // 필요 시 취소 로직 추가
  }
});

// ── 푸시 이벤트 (서버 없이 self.registration.showNotification 직접 사용) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const alarm = event.data.json();
  event.waitUntil(fireNotification(alarm));
});

// ── 알림 클릭 → 앱 포커스 ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // 이미 열린 탭이 있으면 포커스
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      // 없으면 새 탭
      return self.clients.openWindow('./');
    })
  );
});

// ── 알림 표시 함수 ──
function fireNotification(alarm) {
  const icons = {
    'type-start':  { icon: '📌', color: '#5b8dee' },
    'type-warn':   { icon: '⚠️', color: '#e85d75' },
    'type-meet2h': { icon: '⏰', color: '#f0a500' },
    'type-meet0':  { icon: '🚀', color: '#3ecf8e' },
  };
  const cfg = icons[alarm.type] || icons['type-start'];

  const options = {
    body: alarm.sub || alarm.taskTitle,
    icon: './icon-192.png',   // 없어도 무방 — 기본 브라우저 아이콘 사용
    badge: './icon-72.png',
    tag: alarm.taskId ? String(alarm.taskId) : 'scheduler-alarm',
    renotify: true,
    requireInteraction: true,   // 사용자가 닫을 때까지 유지
    vibrate: [200, 100, 200, 100, 200],
    data: { alarm },
    actions: [
      { action: 'confirm', title: '✅ 확인' },
    ]
  };

  return self.registration.showNotification(
    alarm.kind + ' — ' + alarm.taskTitle,
    options
  );
}
