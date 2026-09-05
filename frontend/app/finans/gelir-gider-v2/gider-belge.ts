import { ggService } from "./gg-v2-api";

export type BelgeMode = "view" | "pdf" | "print";

function openBlob(blob: Blob, filename: string, mode: BelgeMode) {
  const url = URL.createObjectURL(blob);
  if (mode === "pdf") {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return;
  }
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    throw new Error("Açılır pencere engellendi. Pop-up izni verin.");
  }
  if (mode === "print") {
    const timer = window.setInterval(() => {
      try {
        if (w.document.readyState === "complete") {
          window.clearInterval(timer);
          w.focus();
          w.print();
        }
      } catch {
        window.clearInterval(timer);
      }
    }, 400);
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function openGiderIslemBelgesi(giderId: number, mode: BelgeMode = "view") {
  const { blob, filename } = await ggService.giderBelge(giderId, "gider");
  openBlob(blob, filename || "gider-belgesi.pdf", mode);
}

export async function openOdemePlaniBelgesi(giderId: number, mode: BelgeMode = "view") {
  const { blob, filename } = await ggService.giderBelge(giderId, "odeme-plani");
  openBlob(blob, filename || "odeme-plani.pdf", mode);
}

export async function openOdemeBelgesi(giderId: number, odemeId: number, mode: BelgeMode = "view") {
  const { blob, filename } = await ggService.odemeBelge(giderId, odemeId);
  openBlob(blob, filename || "odeme-belgesi.pdf", mode);
}
