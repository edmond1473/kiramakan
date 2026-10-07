// KiraMakan service worker：只负责手机通知（不做离线快取）。

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "KiraMakan";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  // iPhone 规定每一个 push 都一定要显示通知
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin || !("navigate" in client)) continue;
        try {
          const moved = await client.navigate(target);
          await (moved || client).focus();
          return;
        } catch {
          // navigate 不行的话就开新的
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// 浏览器自己换了订阅（例如过期）：用同样的设定再订一次，告诉 server
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const options = old && old.options ? old.options : null;
      if (!options) return;
      const sub = await self.registration.pushManager.subscribe(options);
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(sub.toJSON()),
      });
    })(),
  );
});
