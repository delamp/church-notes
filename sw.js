// Church Notes' offline helper. It keeps a copy of the app so it opens without signal (recordings are saved on the
// phone and upload later), and it catches files shared in from other apps (Voicemail, Samsung Notes, Gallery).
const CACHE = 'church-notes-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('church-notes-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Android share sheet -> Church Notes: stash the files and text, then open the app's "Add to Church Notes" sheet.
  if (event.request.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData();
        const box = await caches.open('cn-share');
        for (const k of await box.keys()) await box.delete(k);
        const files = form.getAll('files').filter((f) => f && typeof f !== 'string');
        let i = 0;
        for (const f of files) {
          await box.put('./shared/' + (i++), new Response(f, { headers: { 'content-type': f.type || '', 'x-name': encodeURIComponent(f.name || 'shared') } }));
        }
        const text = [form.get('title'), form.get('text'), form.get('url')].filter(Boolean).join('\n');
        if (text) await box.put('./shared/text', new Response(new Blob([text], { type: 'text/plain' }), { headers: { 'x-name': '__text__' } }));
      } catch (e) { /* open the app anyway */ }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && !url.search) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); }
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || caches.match('./')))
  );
});
