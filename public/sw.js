const CACHE = 'shelf-twin-v1'

const PRECACHE = ['/', '/index.html']

function isCacheableAsset(pathname: string): boolean {
  if (pathname.startsWith('/api')) return false
  if (pathname === '/' || pathname === '/index.html') return true
  if (pathname.startsWith('/assets/')) return true
  if (pathname.startsWith('/model/')) return true
  if (/\.(woff2?|ttf|otf)$/i.test(pathname)) return true
  return false
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (!isCacheableAsset(url.pathname)) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (!response.ok) return response
        const copy = response.clone()
        void caches.open(CACHE).then((cache) => cache.put(request, copy))
        return response
      })
    }),
  )
})
