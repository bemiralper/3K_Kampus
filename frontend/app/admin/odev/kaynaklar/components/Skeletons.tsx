// ========== Skeleton Loading Component ==========
"use client";
import React from "react";

export function BookListSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ width: "60%", height: 16, background: "#e2e8f0", borderRadius: 4, marginBottom: 8, animation: "pulse 1.5s infinite" }} />
              <div style={{ width: "40%", height: 12, background: "#f1f5f9", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
            </div>
            <div style={{ width: 60, height: 22, background: "#f1f5f9", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            {[1, 2, 3].map(j => (
              <div key={j} style={{ width: 60, height: 12, background: "#f1f5f9", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StructureSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 20 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "#f8fafc", display: "flex", justifyContent: "space-between" }}>
            <div style={{ width: "50%", height: 16, background: "#e2e8f0", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
            <div style={{ width: 60, height: 14, background: "#e2e8f0", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
