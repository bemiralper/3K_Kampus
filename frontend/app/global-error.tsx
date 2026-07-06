"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isRouterCacheError =
    error.message?.includes("parallelRoutes") ||
    error.message?.includes("newCache") ||
    (error.message?.includes("null is not an object") && error.message?.includes("evaluating"));

  const onRetry = () => {
    if (isRouterCacheError) {
      try {
        sessionStorage.removeItem("lms_chunk_reload");
      } catch {
        /* ignore */
      }
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <html lang="tr">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Bir hata oluştu</h2>
          <p style={{ fontSize: "0.875rem", color: "#666", textAlign: "center" }}>
            {isRouterCacheError
              ? "Sayfa önbelleği güncellenemedi. Tam yenileme yapılıyor…"
              : error.message || "Uygulama yüklenirken bir sorun oluştu."}
          </p>
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  );
}
