"use client";

export default function Error({
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
      window.location.href = "/";
      return;
    }
    reset();
  };

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-lg font-semibold">Bir hata oluştu</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {error.message || "Sayfa yüklenirken bir sorun oluştu."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        Tekrar dene
      </button>
    </div>
  );
}
