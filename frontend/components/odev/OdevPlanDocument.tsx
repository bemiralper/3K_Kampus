"use client";

import { forwardRef } from "react";
import type { ContentTaskHistory, PlanLessonGroup } from "./odevPlanTypes";
import { MetaCol, assignmentTypeLabel } from "./odevPdfMeta";
import { isAutoCompletionNote } from "./odevCompletionHelpers";

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
  /** Mavi üst bar → şeffaf/beyaz logo; açık footer → koyu logo */
  const headerLogoUrl = "/img/beyaz-logo.png";
  const footerLogoUrl = "/img/3k-logo.png";
  const currentYear = new Date().getFullYear();
  const docRef = documentRef || `ÖCP-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const completionCount = cartGroups.reduce(
    (sum, lesson) => sum + lesson.books.reduce(
      (bSum, book) => bSum + book.topics.reduce(
        (tSum, topic) => tSum + topic.items.filter(({ content: item }) => {
          if (item.isCompletionTask) return true;
          const hist = taskHistory[item.contentId];
          return Boolean(hist && (hist.completion_status === "PARTIAL" || hist.completion_status === "NOT_DONE"));
        }).length,
        0,
      ),
      0,
    ),
    0,
  );

  return (
    <div
      ref={ref}
      id="odev-plan-print-area"
      style={{
        padding: "14px 10px",
        fontFamily: "'Poppins', sans-serif",
        color: "#172b4c",
        lineHeight: 1.4,
        maxWidth: 860,
        margin: "0 auto",
        background: "#fff",
      }}
    >
      <div style={{
        position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, #003d6b 0%, #0061a6 40%, #0085e0 100%)",
        borderRadius: 10, padding: "12px 16px", marginBottom: 12, color: "#fff",
      }}>
        <div style={{
          position: "absolute", top: -24, right: -24, width: 80, height: 80,
          borderRadius: "50%", background: "rgba(255,255,255,0.08)",
        }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={headerLogoUrl}
              alt="3K"
              crossOrigin="anonymous"
              style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.6, lineHeight: 1.2 }}>3K KAMPÜS</div>
              <div style={{
                marginTop: 3, display: "inline-block", padding: "1px 8px", borderRadius: 10,
                background: "rgba(255,255,255,0.16)", fontSize: 8, fontWeight: 600,
                letterSpacing: 1.2, textTransform: "uppercase",
              }}>
                Ödev Takip Formu
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right", flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontSize: 15, fontWeight: 700, margin: 0, lineHeight: 1.25,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {title || "Ödev Takip Formu"}
            </h1>
            <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>
              {docRef} · {assignedDateStr}
            </div>
          </div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "rgba(255,255,255,0.12)", borderRadius: 8,
          padding: "7px 12px",
        }}>
          {studentPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studentPhoto} alt={studentName} crossOrigin="anonymous"
              style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: "1.5px solid rgba(255,255,255,0.5)", flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700,
            }}>
              {studentName.split(" ").map((w) => w.charAt(0)).join("").substring(0, 2)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{studentName}</div>
            <div style={{ fontSize: 9, opacity: 0.75 }}>Öğrenci</div>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 10, opacity: 0.95, flexShrink: 0 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 8, opacity: 0.7, lineHeight: 1.2 }}>Verilme</div>
              <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{assignedDateStr}</div>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.3)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 8, opacity: 0.7, lineHeight: 1.2 }}>Teslim</div>
              <div style={{ fontWeight: 600, color: "#fbbf24", lineHeight: 1.2 }}>{dueDateStr || "—"}</div>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.3)" }} />
            <div style={{ textAlign: "center", maxWidth: 90 }}>
              <div style={{ fontSize: 8, opacity: 0.7, lineHeight: 1.2 }}>Koç</div>
              <div style={{ fontWeight: 600, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{coachName}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        <MetaCol
          label="Ders"
          value={String(cartGroups.length)}
          minWidth={48}
          valueColor="#4338ca"
          borderColor="#c7d2fe"
          background="#eef2ff"
        />
        <MetaCol
          label="Görev"
          value={String(itemCount)}
          minWidth={48}
          valueColor="#059669"
          borderColor="#a7f3d0"
          background="#ecfdf5"
        />
        {totalQuestions > 0 && (
          <MetaCol
            label="Soru"
            value={String(totalQuestions)}
            minWidth={48}
            valueColor="#ea580c"
            borderColor="#fed7aa"
            background="#fff7ed"
          />
        )}
        {totalPages > 0 && (
          <MetaCol
            label="Sayfa"
            value={String(totalPages)}
            minWidth={48}
            valueColor="#be185d"
            borderColor="#fbcfe8"
            background="#fdf2f8"
          />
        )}
        {completionCount > 0 && (
          <MetaCol
            label="Eksik"
            value={String(completionCount)}
            minWidth={48}
            valueColor="#1d4ed8"
            borderColor="#bfdbfe"
            background="#eff6ff"
          />
        )}
      </div>

      {notes && (
        <div style={{
          padding: "8px 12px", marginBottom: 10,
          background: "#fffbeb", border: "1px solid #fde68a",
          borderRadius: 6, fontSize: 11, color: "#92400e", lineHeight: 1.5,
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
              {lesson.books.reduce((s, b) => s + b.topics.reduce((s2, t) => s2 + t.items.length, 0), 0)} görev
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
                    ({book.topics.reduce((s, t) => s + t.items.length, 0)} görev)
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
                        const isCompletion = Boolean(item.isCompletionTask)
                          || Boolean(hist && (hist.completion_status === "PARTIAL" || hist.completion_status === "NOT_DONE"));
                        const prevPct = item.previousCompletionPercent
                          ?? (hist?.completion_status === "PARTIAL" ? hist.task_completion_percent : null);
                        const prevTitle = item.previousAssignmentTitle
                          || (isCompletion ? hist?.assignment_title : "")
                          || "";
                        const showPrevPct = prevPct != null && prevPct > 0;
                        return (
                          <div key={item.id} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "5px 8px",
                            minHeight: 32,
                            borderBottom: "1px solid #f0f2f5",
                            borderRight: idx % 2 === 0 ? "1px solid #f0f2f5" : "none",
                            fontSize: 11, color: "#172b4c",
                            background: isCompletion ? "#eff6ff" : (idx % 4 < 2 ? "#fff" : "#fafbfc"),
                            borderLeft: isCompletion ? "3px solid #3b82f6" : "none",
                          }}>
                            <span style={{
                              display: "inline-flex", width: 12, height: 12,
                              border: "1.5px solid #cbd5e1", borderRadius: 3, flexShrink: 0,
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                fontWeight: 500, lineHeight: 1.25,
                              }}>
                                {item.contentName}
                              </div>
                              {isCompletion && (
                                <div style={{ fontSize: 8, color: "#1d4ed8", fontWeight: 600, marginTop: 1, lineHeight: 1.2 }}>
                                  🔄 {showPrevPct ? "Eksik Tamamlama" : "Tekrar (yapılmamıştı)"}
                                  {showPrevPct && (
                                    <span style={{ padding: "0 4px", borderRadius: 3, background: "#dbeafe", fontSize: 7, fontWeight: 700, marginLeft: 4 }}>
                                      önceki: %{prevPct}
                                    </span>
                                  )}
                                  {prevTitle && (
                                    <span style={{ color: "#64748b", fontWeight: 500, marginLeft: 4 }}>
                                      · {prevTitle}
                                    </span>
                                  )}
                                </div>
                              )}
                              {/* Otomatik eksik notu zaten üst satırda; yalnızca koçun eklediği özel notu göster */}
                              {note && !(isCompletion && isAutoCompletionNote(note)) && (
                                <div style={{ fontSize: 9, color: "#0061a6", fontStyle: "italic", marginTop: 1, lineHeight: 1.2 }}>
                                  📌 {note}
                                </div>
                              )}
                            </div>
                            <div style={{
                              display: "inline-flex",
                              alignItems: "stretch",
                              gap: 3,
                              flexShrink: 0,
                            }}>
                              <MetaCol label="Tür" value={assignmentTypeLabel(item.contentType)} />
                              {item.questionCount > 0 && (
                                <MetaCol label="Soru" value={String(item.questionCount)} />
                              )}
                              {item.pageCount > 0 && (
                                <MetaCol label="Sayfa" value={String(item.pageCount)} />
                              )}
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
        Bu ödev takip formu, öğrenci maestro koçu <strong>{coachName}</strong> tarafından
        öğrenci analizi yapılarak hazırlanmıştır.
      </div>

      <div style={{
        paddingTop: 12, borderTop: "2px solid #0061a6",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 9, color: "#8c98a4",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={footerLogoUrl} alt="3K" crossOrigin="anonymous"
            style={{ width: 16, height: 16, objectFit: "contain", opacity: 0.5 }} />
          <span style={{ fontWeight: 600 }}>3K Kampüs Koçluk Merkezi</span>
        </div>
        <span>© {currentYear} Tüm hakları saklıdır.</span>
      </div>
    </div>
  );
});

export default OdevPlanDocument;
