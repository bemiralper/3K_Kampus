"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";

const SozlesmeBelgesi = dynamic(() => import("../../components/SozlesmeBelgesi"), {
  ssr: false,
  loading: () => <BelgeLoading />,
});

function BelgeLoading() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f1f5f9",
      color: "#475569",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: "32px 48px",
        boxShadow: "0 4px 24px rgba(0,0,0,.08)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
        Sözleşme belgesi hazırlanıyor...
      </div>
    </div>
  );
}

class BelgeErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : "Beklenmeyen hata";
    return { hasError: true, message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f1f5f9",
          padding: 24,
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 16,
            padding: 32,
            maxWidth: 480,
            textAlign: "center",
            border: "1px solid #fecaca",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>❌</div>
            <p style={{ color: "#334155", marginBottom: 8 }}>Sözleşme belgesi açılamadı.</p>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>{this.state.message}</p>
            <p style={{ color: "#94a3b8", fontSize: 12 }}>
              Geliştirme ortamında <code>rm -rf .next</code> sonrası <code>npm run dev</code> deneyin.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Sözleşme belgesini doğrudan önizleme (geliştirme / yazdırma) */
export default function BelgeOnizlemePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const sozlesmeId = Number(id);

  if (!sozlesmeId || Number.isNaN(sozlesmeId)) {
    return (
      <div style={{ minHeight: "100vh", padding: 40, textAlign: "center", background: "#f1f5f9" }}>
        Geçersiz sözleşme numarası
      </div>
    );
  }

  return (
    <BelgeErrorBoundary>
      <SozlesmeBelgesi
        sozlesmeId={sozlesmeId}
        variant="page"
        onClose={() => {
          if (typeof window !== "undefined") window.history.back();
        }}
      />
    </BelgeErrorBoundary>
  );
}
