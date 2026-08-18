const CACHE_NAME = "health-platform-v3";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// تثبيت Service Worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        FILES_TO_CACHE.map((file) => {
          return cache.add(file).catch(() => {
            // تجاهل الملف إذا لم يكن موجودًا
          });
        })
      );
    })
  );

  self.skipWaiting();
});

// تفعيل النسخة الجديدة وحذف الكاش القديم
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );

  self.clients.claim();
});

// التعامل مع الطلبات
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // لا نتعامل إلا مع GET
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // لا نخزن أي طلب يحتوي على Query Parameters
  // مثل ?utm_source= أو أي معاملات أخرى.
  if (url.search) {
    return;
  }

  // لا نتدخل في أي موقع أو خدمة خارج موقعنا
  // مثل Supabase أو Google أو أي خدمة خارجية.
  if (url.origin !== self.location.origin) {
    return;
  }

  // لا نتدخل في مسارات API
  if (url.pathname.includes("/api/")) {
    return;
  }

  // الملفات التي نسمح بتخزينها في الكاش فقط
  const isStaticFile =
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/icon-192.png") ||
    url.pathname.endsWith("/icon-512.png");

  // أي ملف ديناميكي آخر:
  // نتركه يذهب للشبكة فقط ولا نخزنه.
  if (!isStaticFile) {
    return;
  }

  // Network First:
  // نحاول الحصول على النسخة الجديدة من الإنترنت أولًا،
  // وإذا لم يوجد إنترنت نستخدم الكاش.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const responseClone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }

        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          return cachedResponse || caches.match("./");
        });
      })
  );
});
