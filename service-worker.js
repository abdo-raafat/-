const CACHE_NAME = "health-platform-v4";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// تثبيت النسخة الجديدة
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        APP_SHELL.map(async (file) => {
          try {
            await cache.add(file);
          } catch (error) {
            // تجاهل الملف إذا لم يكن موجودًا
          }
        })
      );
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// تفعيل النسخة الجديدة وحذف الكاش القديم
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return (
              name !== CACHE_NAME &&
              name.startsWith("health-platform-v")
            );
          })
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// التعامل مع الطلبات
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // GET فقط
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // لا نتدخل في المواقع الخارجية
  if (url.origin !== self.location.origin) {
    return;
  }

  // لا نتعامل مع API
  if (url.pathname.includes("/api/")) {
    return;
  }

  /*
   * مهم جدًا:
   * index.html والصفحة الرئيسية لازم Network First
   * علشان أي تحديث على GitHub يظهر للمستخدم.
   */
  const isHTML =
    request.mode === "navigate" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html");

  if (isHTML) {
    event.respondWith(
      fetch(request, {
        cache: "no-store"
      })
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }

          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match("./index.html");
          });
        })
    );

    return;
  }

  /*
   * الملفات الثابتة:
   * لو موجودة في الكاش نستخدمها.
   * ولو مش موجودة نحملها ونخزنها.
   */
  const isStaticFile =
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/icon-192.png") ||
    url.pathname.endsWith("/icon-512.png");

  if (isStaticFile) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }

          return response;
        });
      })
    );

    return;
  }

  /*
   * أي ملفات أو خدمات أخرى:
   * لا نتدخل فيها.
   * خصوصًا Supabase.
   */
});
