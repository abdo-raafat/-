const CACHE_NAME = "health-platform-v5";

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
              // الملف غير موجود أو تعذر تحميله — تجاهل
            }
          })
        );
      })
      .then(() => {
        /*
         * تفعيل النسخة الجديدة فورًا
         * بدون انتظار إغلاق التطبيق.
         */
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
                name !== CACHE_NAME &&
                name.startsWith("health-platform-v")
              );
            })
            .map((name) => caches.delete(name))
        );
      })
      .then(() => {
        /*
         * السيطرة على جميع الصفحات المفتوحة
         * فور تفعيل النسخة الجديدة.
         */
        return self.clients.claim();
      })
  );
});


/*
 * ================================
 * MESSAGE
 * ================================
 *
 * يسمح للـHTML بطلب فحص/تحديث
 * الـService Worker أثناء تشغيل التطبيق.
 */
self.addEventListener("message", (event) => {
  if (!event.data) return;

  /*
   * طلب تفعيل النسخة الجديدة فورًا
   */
  if (event.data.type === "BSM_SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  /*
   * طلب إعادة تحميل/تحديث الـService Worker
   */
  if (event.data.type === "BSM_CHECK_UPDATE") {
    self.registration.update().catch(() => {});
  }
});


/*
 * ================================
 * FETCH
 * ================================
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  /*
   * GET فقط
   */
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /*
   * لا نتدخل في المواقع الخارجية.
   * مهم جدًا للفيديوهات Embed مثل Fembed
   * وSupabase وأي خدمة خارجية.
   */
  if (url.origin !== self.location.origin) {
    return;
  }

  /*
   * لا نتعامل مع API.
   * Supabase يظل خارج نظام الكاش.
   */
  if (url.pathname.includes("/api/")) {
    return;
  }


  /*
   * ================================
   * HTML / NAVIGATION
   * NETWORK FIRST
   * ================================
   *
   * الأولوية دائمًا للنسخة الموجودة
   * على GitHub / السيرفر.
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
   * SERVICE WORKER نفسه
   * ================================
   *
   * لا نخزن نسخة قديمة منه في الكاش.
   * هذا يسمح للمتصفح باكتشاف النسخة الجديدة.
   */
  if (
    url.pathname.endsWith("/service-worker.js") ||
    url.pathname.endsWith("/sw.js")
  ) {
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
   * STATIC FILES
   * ================================
   */
  const isStaticFile =
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/icon-192.png") ||
    url.pathname.endsWith("/icon-512.png");

  if (isStaticFile) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(request)
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
            });
        })
    );

    return;
  }


  /*
   * ================================
   * باقي الملفات والطلبات
   * ================================
   *
   * لا نتدخل فيها.
   * خصوصًا:
   * - Supabase
   * - الفيديوهات
   * - الصوت
   * - الصور الخارجية
   * - Embed
   * - Fembed
   * - أي API خارجي
   */
});
