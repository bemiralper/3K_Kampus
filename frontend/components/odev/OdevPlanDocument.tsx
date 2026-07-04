"use client";

import { forwardRef } from "react";
import type { ContentTaskHistory, PlanLessonGroup } from "./odevPlanTypes";

export interface OdevPlanDocumentProps {
  studentName: string;
  studentPhoto?: string;
  coachName: string;
  title: string;
  notes: string;
  assignedDateStr: string;
  dueDateStr: string;
  documentRef?: string;
  cartGroups: PlanLessonGroup[];
  itemCount: number;
  totalQuestions: number;
  totalPages: number;
  taskHistory?: ContentTaskHistory;
}

const typeLabel = (t: string) =>
  t === "TEST_SET" ? "Test" : t === "PAGE_RANGE" ? "PDF" : t === "VIDEO" ? "Video" : "Konu";

const OdevPlanDocument = forwardRef<HTMLDivElement, OdevPlanDocumentProps>(function OdevPlanDocument(
  {
    studentName,
    studentPhoto,
    coachName,
    title,
    notes,
    assignedDateStr,
    dueDateStr,
    documentRef,
    cartGroups,
    itemCount,
    totalQuestions,
    totalPages,
    taskHistory = {},
  },
  ref,
) {
  const logoUrl = "/img/3k-logo.png";
  const currentYear = new Date().getFullYear();
  const docRef = documentRef || `ÖCP-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const completionCount = Object.values(taskHistory).filter(
    (h) => h && (h.completion_status === "PARTIAL" || h.completion_status === "NOT_DONE"),
  ).length;

  return (
    <div
      ref={ref}
      id="odev-plan-print-area"
      style={{
        padding: "36px 44px",
        fontFamily: "'Poppins', sans-serif",
        color: "#172b4c",
        lineHeight: 1.5,
        maxWidth: 780,
        margin: "0 auto",
        background: "#fff",
      }}
    >
      <div style={{
        position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, #003d6b 0%, #0061a6 40%, #0085e0 100%)",
        borderRadius: 14, padding: "28px 32px", marginBottom: 28, color: "#fff",
      }}>
        <div style={{
          position: "absolute", top: -30, right: -30, width: 120, height: 120,
          borderRadius: "50%", background: "rgba(255,255,255,0.08)",
        }} />
        <div style={{
          position: "absolute", bottom: -20, right: 60, width: 80, height: 80,
          borderRadius: "50%", background: "rgba(255,255,255,0.05)",
        }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="3K" crossOrigin="anonymous"
                style={{ width: 40, height: 40, objectFit: "contain" }} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>3K KAMPÜS</div>
              <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 400, letterSpacing: 0.5 }}>Koçluk &amp; Danışmanlık Merkezi</div>
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, opacity: 0.7, lineHeight: 1.8 }}>
            <div>Belge: {docRef}</div>
            <div>{assignedDateStr}</div>
          </div>
        </div>

        <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
          <div style={{
            display: "inline-block", padding: "3px 18px", borderRadius: 20,
            background: "rgba(255,255,255,0.15)", fontSize: 10, fontWeight: 600,
            letterSpacing: 2, textTransform: "uppercase", marginBottom: 10,
          }}>
            ÖĞRENCİ ÇALIŞMA PLANI
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            {title || "Haftalık Çalışma Programı"}
          </h1>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          background: "rgba(255,255,255,0.12)", borderRadius: 10,
          padding: "12px 18px",
        }}>
          {studentPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studentPhoto} alt={studentName} crossOrigin="anonymous"
              style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.5)", flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
              background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700,
            }}>
              {studentName.split(" ").map((w) => w.charAt(0)).join("").substring(0, 2)}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{studentName}</div>
            <div style={{ fontSize: 10, opacity: 0.75 }}>Öğrenci</div>
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: 11, opacity: 0.9 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, opacity: 0.7, marginBottom: 2 }}>Verilme</div>
              <div style={{ fontWeight: 600 }}>{assignedDateStr}</div>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.3)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, opacity: 0.7, marginBottom: 2 }}>Teslim</div>
              <div style={{ fontWeight: 600, color: "#fbbf24" }}>{dueDateStr || "—"}</div>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.3)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, opacity: 0.7, marginBottom: 2 }}>Koç</div>
              <div style={{ fontWeight: 600 }}>{coachName}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe" }}>
          📚 {cartGroups.length} Ders
        </div>
        <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" }}>
          📋 {itemCount} İçerik
        </div>
        {totalQuestions > 0 && (
          <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#fff7ed", color: "#ea580c", border: "1px solid #fed7aa" }}>
            ✏️ {totalQuestions} Soru
          </div>
        )}
        {totalPages > 0 && (
          <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#fdf2f8", color: "#be185d", border: "1px solid #fbcfe8" }}>
            📄 {totalPages} Sayfa
          </div>
        )}
        {completionCount > 0 && (
          <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
            🔄 {completionCount} Eksik Tamamlama
          </div>
        )}
      </div>

      {notes && (
        <div style={{
          padding: "12px 16px", marginBottom: 20,
          background: "#fffbeb", border: "1px solid #fde68a",
          borderRadius: 8, fontSize: 12, color: "#92400e", lineHeight: 1.6,
        }}>
          <strong>📌 Koç Notu:</strong> {notes}
        </div>
      )}

      {cartGroups.map((lesson, li) => (
        <div key={lesson.lessonId} style={{ marginBottom: 12 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px", background: "#0061a6", color: "#fff",
            borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: 600,
          }}>
            <span>{li + 1}. {lesson.lessonName}</span>
            <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>
              {lesson.books.reduce((s, b) => s + b.topics.reduce((s2, t) => s2 + t.items.length, 0), 0)} içerik
              {lesson.totalQuestions > 0 ? ` · ${lesson.totalQuestions} soru` : ""}
              {lesson.totalPages > 0 ? ` · ${lesson.totalPages} sayfa` : ""}
            </span>
          </div>
          <div style={{ border: "1px solid #e4e9f2", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
            {lesson.books.map((book) => (
              <div key={book.bookId}>
                <div style={{
                  padding: "5px 14px", background: "#e8f0fe",
                  fontSize: 10, fontWeight: 600, color: "#1a56db",
                  borderBottom: "1px solid #d4dff7",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  📖 {book.bookName}
                  <span style={{ fontSize: 9, fontWeight: 400, color: "#6b7280" }}>
                    ({book.topics.reduce((s, t) => s + t.items.length, 0)} içerik)
                  </span>
                </div>
                {book.topics.map((topic) => (
                  <div key={topic.topicId}>
                    <div style={{
                      padding: "6px 14px", background: "#f0f4f8",
                      fontSize: 11, fontWeight: 600, color: "#0061a6",
                      borderBottom: "1px solid #e4e9f2",
                    }}>
                      📂 {topic.topicName}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0 }}>
                      {topic.items.map(({ content: item, note }, idx) => {
                        const hist = taskHistory[item.contentId];
                        const isCompletion = hist && (hist.completion_status === "PARTIAL" || hist.completion_status === "NOT_DONE");
                        return (
                          <div key={item.id} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "6px 12px",
                            borderBottom: "1px solid #f0f2f5",
                            borderRight: idx % 2 === 0 ? "1px solid #f0f2f5" : "none",
                            fontSize: 11, color: "#172b4c",
                            background: isCompletion ? "#eff6ff" : (idx % 4 < 2 ? "#fff" : "#fafbfc"),
                            borderLeft: isCompletion ? "3px solid #3b82f6" : "none",
                          }}>
                            <span style={{
                              display: "inline-flex", width: 14, height: 14,
                              border: "1.5px solid #cbd5e1", borderRadius: 3, flexShrink: 0,
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                fontWeight: 500,
                              }}>
                                {item.contentName}
                              </div>
                              {isCompletion && hist && (
                                <div style={{ fontSize: 8, color: "#1d4ed8", fontWeight: 600, marginTop: 1 }}>
                                  🔄 Eksik Tamamlama
                                  {hist.task_completion_percent != null && (
                                    <span style={{ padding: "0 4px", borderRadius: 3, background: "#dbeafe", fontSize: 7, fontWeight: 700, marginLeft: 4 }}>
                                      önceki: %{hist.task_completion_percent}
                                    </span>
                                  )}
                                </div>
                              )}
                              {note && (
                                <div style={{ fontSize: 9, color: "#0061a6", fontStyle: "italic", marginTop: 1 }}>
                                  📌 {note}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: "#8c98a4", whiteSpace: "nowrap", flexShrink: 0 }}>
                              <span style={{
                                padding: "1px 5px", borderRadius: 3, marginRight: 3,
                                background: item.contentType === "TEST_SET" ? "#eef2ff" : item.contentType === "VIDEO" ? "#fdf2f8" : "#f0fdf4",
                                color: item.contentType === "TEST_SET" ? "#4338ca" : item.contentType === "VIDEO" ? "#be185d" : "#16a34a",
                                fontWeight: 500,
                              }}>
                                {typeLabel(item.contentType)}
                              </span>
                              {item.questionCount ? `${item.questionCount}s` : ""}
                              {item.questionCount && item.pageCount ? "/" : ""}
                              {item.pageCount ? `${item.pageCount}p` : ""}
                            </div>
                          </div>
                        );
                      })}
                      {topic.items.length % 2 !== 0 && (
                        <div style={{ borderBottom: "1px solid #f0f2f5" }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{
        padding: "12px 18px", marginBottom: 20,
        background: "#f0f7ff", borderRadius: 8, border: "1px solid #dbeafe",
        fontSize: 10, color: "#1e40af", lineHeight: 1.7, textAlign: "center",
      }}>
        Bu çalışma programı, öğrenci maestro koçu <strong>{coachName}</strong> tarafından
        öğrenci analizi yapılarak hazırlanmıştır.
      </div>

      <div style={{
        paddingTop: 12, borderTop: "2px solid #0061a6",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 9, color: "#8c98a4",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="3K" crossOrigin="anonymous"
            style={{ width: 16, height: 16, objectFit: "contain", opacity: 0.5 }} />
          <span style={{ fontWeight: 600 }}>3K Kampüs Koçluk Merkezi</span>
        </div>
        <span>© {currentYear} Tüm hakları saklıdır.</span>
      </div>
    </div>
  );
});

export default OdevPlanDocument;
