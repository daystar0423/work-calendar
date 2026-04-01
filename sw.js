// ═══════════════════════════════════════════════════════
//  Service Worker v3 — 업무 스케줄러
//  전략: 알람 목록을 IndexedDB에 저장,
//        SW가 백그라운드에서 1분마다 체크 → 네이티브 알림
// ═══════════════════════════════════════════════════════

const DB_NAME    = 'scheduler-db';
const DB_VERSION = 1;
const STORE      = 'alarms';
const CHECK_MS   = 60 * 1000; // 1분

// ── 설치 / 활성화 ──
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => {
  e.waitUntil(self.clients.claim());
  scheduleNextCheck();
});

// ── 앱 → SW 메시지 ──
self.addEventListener('message', e => {
  const { type, payload } = e.data || {};
  if (type === 'SYNC_ALARMS') {
    syncAlarms(payload.alarms).then(() => checkAndFire());
  }
  if (type === 'CLEAR_ALARM') {
    deleteAlarm(payload.id);
  }
  if (type === 'CLEAR_ALL') {
    clearAll();
  }
});

// ── 알림 클릭 ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const aid = e.notification.data && e.notification.data.alarmId;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      clients.forEach(c => c.postMessage({ type: 'ALARM_CONFIRMED', alarmId: aid }));
      if (aid) deleteAlarm(aid);
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});

// ── 체크 루프 ──
function scheduleNextCheck() {
  setTimeout(function loop() {
    checkAndFire().finally(() => setTimeout(loop, CHECK_MS));
  }, CHECK_MS);
}

async function checkAndFire() {
  const now    = Date.now();
  const alarms = await getAll();
  for (const a of alarms) {
    const diff = now - a.fireAt;
    if (diff >= 0 && diff < 10 * 60 * 1000) {
      // 발화 시각 도달 (10분 이내 놓친 것도 포함)
      await fire(a);
      await deleteAlarm(a.id);
    } else if (diff >= 10 * 60 * 1000) {
      // 너무 오래된 알람 조용히 삭제
      await deleteAlarm(a.id);
    }
  }
}

async function fire(a) {
  const labels = {
    'type-start':  '📌 업무 시작일',
    'type-warn':   '⚠️ 마감 2일 전',
    'type-meet2h': '⏰ 회의 2시간 전',
    'type-meet0':  '🚀 회의 시작!',
  };
  const title = (labels[a.type] || '🔔 알람') + ' — ' + a.taskTitle;
  return self.registration.showNotification(title, {
    body:               a.sub || a.taskTitle,
    icon:               './icon-192.png',
    badge:              './icon-72.png',
    tag:                String(a.id),
    renotify:           true,
    requireInteraction: true,
    vibrate:            [200, 100, 200, 100, 200],
    data:               { alarmId: a.id },
    actions:            [{ action: 'ok', title: '✅ 확인' }]
  });
}

// ── IndexedDB 헬퍼 ──
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror   = e => rej(e.target.error);
  });
}

async function syncAlarms(list) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    st.clear();
    (list || []).forEach(a => st.put(a));
    tx.oncomplete = res;
    tx.onerror    = e => rej(e.target.error);
  });
}

async function getAll() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const r  = tx.objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror   = e => rej(e.target.error);
  });
}

async function deleteAlarm(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = res;
    tx.onerror    = e => rej(e.target.error);
  });
}

async function clearAll() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = res;
    tx.onerror    = e => rej(e.target.error);
  });
}
