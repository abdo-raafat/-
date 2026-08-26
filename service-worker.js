const CACHE_NAME = "health-platform-v6";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

/*
 * ================================
 * INSTALL
 * ================================
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await Promise.all(
          APP_SHELL.map(async (file) => {
            try {
              await cache.add(file);
            } catch (error) {
              // تجاهل أي ملف غير موجود
            }
          })
        );
      })
      .then(() => {
        // تفعيل النسخة الجديدة فورًا
        return self.skipWaiting();
      })
  );
});


/*
 * ================================
 * ACTIVATE
 * ================================
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return (
                name.startsWith("health-platform-v") &&
                name !== CACHE_NAME
              );
            })
            .map((name) => caches.delete(name))
        );
      })
      .then(() => {
        // السيطرة على التطبيق/الصفحات المفتوحة فورًا
        return self.clients.claim();
      })
  );
});


/*
 * ================================
 * MESSAGE
 * ================================
 */
self.addEventListener("message", (event) => {
  if (!event.data) return;

  /*
   * تفعيل النسخة الجديدة فورًا
   */
  if (event.data.type === "BSM_SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  /*
   * إجبار Service Worker على فحص وجود نسخة جديدة
   */
  if (event.data.type === "BSM_CHECK_UPDATE") {
    self.registration.update().catch(() => {});
    return;
  }

  /*
   * تنظيف الكاش القديم يدويًا عند الحاجة
   */
  if (event.data.type === "BSM_CLEAR_OLD_CACHE") {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return (
                name.startsWith("health-platform-v") &&
                name !== CACHE_NAME
              );
            })
            .map((name) => caches.delete(name))
        );
      })
    );
  }
});


/*
 * ================================
 * FETCH
 * ================================
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // GET فقط
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /*
   * لا نتدخل في المواقع الخارجية.
   *
   * مهم جدًا لـ:
   * Fembed
   * الفيديوهات الخارجية
   * الصوت
   * الصور الخارجية
   * Supabase
   * أي خدمة خارجية
   */
  if (url.origin !== self.location.origin) {
    return;
  }

  /*
   * لا نتعامل مع API
   */
  if (
    url.pathname.includes("/api/") ||
    url.pathname.includes("/rest/") ||
    url.pathname.includes("/auth/")
  ) {
    return;
  }


  /*
   * ================================
   * HTML / NAVIGATION
   * NETWORK FIRST
   * ================================
   *
   * دائمًا نحاول أخذ أحدث index.html
   * من GitHub / السيرفر أولًا.
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

            caches.open(CACHE_NAME)
              .then((cache) => {
                return cache.put("./index.html", clone);
              })
              .catch(() => {});
          }

          return response;
        })
        .catch(() => {
          return caches.match("./index.html")
            .then((cached) => {
              return cached || Response.error();
            });
        })
    );

    return;
  }


  /*
   * ================================
   * SERVICE WORKER
   * ================================
   *
   * لا نسمح بتقديم نسخة قديمة منه.
   */
  const isServiceWorker =
    url.pathname.endsWith("/service-worker.js") ||
    url.pathname.endsWith("/sw.js");

  if (isServiceWorker) {
    event.respondWith(
      fetch(request, {
        cache: "no-store"
      }).catch(() => {
        return caches.match(request);
      })
    );

    return;
  }


  /*
   * ================================
   * MANIFEST / ICONS
   * NETWORK FIRST
   * ================================
   *
   * حتى لو تم تعديل manifest أو الأيقونات
   * نحاول أخذ النسخة الجديدة أولًا.
   */
  const isAppMeta =
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/icon-192.png") ||
    url.pathname.endsWith("/icon-512.png");

  if (isAppMeta) {
    event.respondWith(
      fetch(request, {
        cache: "no-store"
      })
        .then((response) => {

          if (response && response.ok) {
            const clone = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                return cache.put(request, clone);
              })
              .catch(() => {});
          }

          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );

    return;
  }


  /*
   * ================================
   * باقي الملفات
   * ================================
   *
   * لا نتدخل فيها.
   *
   * خصوصًا:
   * - Supabase
   * - الفيديوهات
   * - الصوت
   * - الصور
   * - Embed
   * - Fembed
   * - الملفات الخارجية
   * - أي API خارجي
   *
   * وبالتالي لا نكسر المشغل الحالي.
   */
});
