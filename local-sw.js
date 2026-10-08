/* Serves user-selected local game files (stored in the Cache API by index.html)
   under ./__local/<id>/... so a game's scripts, images, wasm, workers, fetch()/XHR
   requests etc. all resolve exactly like they would on a normal web server. */
const CACHE = "local-games-v1";
const PREFIX = new URL("./__local/", self.registration.scope).pathname;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(PREFIX)) return;
  e.respondWith(serve(e.request, url));
});

async function serve(req, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
  const cache = await caches.open(CACHE);
  let hit = await cache.match(url.origin + url.pathname, { ignoreSearch: true });
  if (!hit) {                       // tolerate differences in percent-encoding
    let want; try { want = decodeURIComponent(url.pathname); } catch (e) { want = url.pathname; }
    for (const k of await cache.keys()) {
      let p; try { p = decodeURIComponent(new URL(k.url).pathname); } catch (e) { p = new URL(k.url).pathname; }
      if (p === want) { hit = await cache.match(k); break; }
    }
  }
  if (!hit) return new Response("not found in the selected folder: " + url.pathname.slice(PREFIX.length), { status: 404, headers: { "Content-Type": "text/plain" } });

  const type = hit.headers.get("Content-Type") || "application/octet-stream";
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("Range") || "");
  if (!range) {
    return new Response(req.method === "HEAD" ? null : hit.body, { status: 200, headers: { ...base, "Content-Length": hit.headers.get("Content-Length") || "" } });
  }
  const blob = await hit.blob(), size = blob.size;
  let start = range[1] === "" ? Math.max(0, size - Number(range[2])) : Number(range[1]);
  let end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  return new Response(blob.slice(start, end + 1), { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
}
