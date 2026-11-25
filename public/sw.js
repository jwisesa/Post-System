// Service worker for web push. The push is payload-less: we fetch the inbox with the session cookie.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const show = (list) => {
  if (!list.length) return self.registration.showNotification("Post-System", { body: "Ada pemberitahuan baru", tag: "ps-generic" });
  return Promise.all(list.slice(0, 5).map((n) => self.registration.showNotification(n.title, { body: n.body, tag: n.id, data: { url: n.url, kind: n.kind }, icon: "/icon-192.png" })))
    .then(() => self.navigator.setAppBadge?.(list.length).catch(() => {}));
};

self.addEventListener("push", (e) =>
  // iOS requires a visible notification for every push, so errors still show one.
  e.waitUntil(
    fetch("/api/push/inbox", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((j) => show(j.notifications || []))
      .catch(() => self.registration.showNotification("Post-System", { body: "Ada pemberitahuan baru", tag: "ps-generic" })),
  ),
);

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/admin", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const w = cs.find((c) => new URL(c.url).origin === self.location.origin);
      return w ? w.focus().then((c) => ("navigate" in c ? c.navigate(url) : c)) : self.clients.openWindow(url);
    }),
  );
});

// "Bersihkan notifikasi": close every shown notification (of a kind, if given) and clear the badge.
self.addEventListener("message", (e) => {
  if (e.data?.type !== "clear") return;
  e.waitUntil(
    self.registration.getNotifications().then((ns) => {
      ns.filter((n) => !e.data.kind || n.data?.kind === e.data.kind || !n.data?.kind).forEach((n) => n.close());
      return self.navigator.clearAppBadge?.();
    }),
  );
});
