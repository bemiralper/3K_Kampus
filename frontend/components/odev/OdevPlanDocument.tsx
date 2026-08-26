"use client";

import { forwardRef } from "react";
import type { ContentTaskHistory, PlanContentItemView, PlanLessonGroup } from "./odevPlanTypes";
import { bookQuotaKind, countPlanBooks, displayTestLabel, quotaBookIcon, quotaKindLabel, splitColumnMajor, unitIsQuotaOnly } from "./odevPlanTypes";
import { MetaCol, assignmentTypeLabel } from "./odevPdfMeta";
import { isAutoCompletionNote } from "./odevCompletionHelpers";
import NoteHtml from "./NoteHtml";

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

function TestRow({
  item,
  note,
  topicName,
  taskHistory,
}: {
  item: PlanContentItemView;
  note: string;
  topicName: string;
  taskHistory: ContentTaskHistory;
}) {
  const hist = taskHistory[item.contentId];
  const isCompletion = Boolean(item.isCompletionTask)
    || Boolean(hist && (hist.completion_status === "PARTIAL" || hist.completion_status === "NOT_DONE"));
  const label = displayTestLabel(item.contentName, topicName);

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "6px 10px",
      minHeight: 32,
      borderBottom: "1px solid #f0f2f5",
      fontSize: 11,
      color: "#172b4c",
      background: "#fff",
    }}>
      <span style={{
        display: "inline-flex",
        width: 12,
        height: 12,
        marginTop: 2,
        border: "1.5px solid #cbd5e1",
        borderRadius: 3,
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 500,
          lineHeight: 1.3,
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          whiteSpace: "normal",
        }}>
          {label}
        </div>
        {note && !(isCompletion && isAutoCompletionNote(note)) && (
          <div style={{
            fontSize: 9, color: "#0061a6", fontStyle: "italic", marginTop: 1, lineHeight: 1.2,
            wordBreak: "break-word",
          }}>
            📌 <NoteHtml html={note} />
          </div>
        )}
        {item.quotaKind && (
          <div style={{ fontSize: 9, fontWeight: 700, color: item.quotaKind === 'PROBLEM' ? '#b45309' : '#0369a1', marginTop: 2 }}>
            {quotaBookIcon(item.quotaKind)} {quotaKindLabel(item.quotaKind)}
          </div>
        )}
        {item.contentType && item.contentType !== "SOLVE_TEST" && item.contentType !== "TEST_SET" && item.contentType !== "QUOTA" && (
          <div style={{ fontSize: 8, color: "#94a3b8", marginTop: 1 }}>
            {assignmentTypeLabel(item.contentType)}
          </div>
        )}
      </div>
      <div style={{
        flexShrink: 0,
        textAlign: "right",
        fontSize: 10,
        fontWeight: 600,
        color: "#475569",
        whiteSpace: "nowrap",
        paddingTop: 1,
        minWidth: 52,
      }}>
        {item.questionCount > 0
          ? `${item.questionCount} Soru`
          : item.pageCount > 0
            ? `${item.pageCount} Sayfa`
            : ""}
      </div>
    </div>
  );
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
  const headerLogoUrl = "/img/beyaz-logo.png";
  const footerLogoUrl = "/img/3k-logo.png";
  const currentYear = new Date().getFullYear();
  const docRef = documentRef || `ÖCP-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const bookCount = countPlanBooks(cartGroups);
  const completionCount = cartGroups.reduce(
    (sum, lesson) => sum + lesson.books.reduce(
      (bSum, book) => bSum + book.units.reduce(
        (uSum, unit) => uSum + unit.topics.reduce(
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
          label="Kitap"
          value={String(bookCount)}
          minWidth={48}
          valueColor="#1d4ed8"
          borderColor="#bfdbfe"
          background="#eff6ff"
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
          <strong>📌 Koç Notu:</strong>
          <div style={{ marginTop: 4 }}><NoteHtml html={notes} /></div>
        </div>
      )}

      {/* Ders → Kitap → Ünite → Konu → Test */}
      {cartGroups.map((lesson, li) => {
        const lessonTaskCount = lesson.books.reduce(
          (s, b) => s + b.units.reduce((s2, u) => s2 + u.topics.reduce((s3, t) => s3 + t.items.length, 0), 0),
          0,
        );
        return (
          <div key={`${lesson.lessonId}-${lesson.lessonName}`} style={{ marginBottom: 12 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", background: "#0061a6", color: "#fff",
              borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: 600,
              gap: 8,
            }}>
              <span style={{
                wordBreak: "break-word", overflowWrap: "anywhere", lineHeight: 1.3,
              }}>
                {li + 1}. {lesson.lessonName}
              </span>
              <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85, flexShrink: 0 }}>
                {lessonTaskCount} görev
                {lesson.totalQuestions > 0 ? ` · ${lesson.totalQuestions} soru` : ""}
                {lesson.totalPages > 0 ? ` · ${lesson.totalPages} sayfa` : ""}
              </span>
            </div>
            <div style={{
              border: "1px solid #e4e9f2", borderTop: "none",
              borderRadius: "0 0 8px 8px", overflow: "hidden",
            }}>
              {lesson.books.map((book) => {
                const bookTaskCount = book.units.reduce(
                  (s, u) => s + u.topics.reduce((s2, t) => s2 + t.items.length, 0),
                  0,
                );
                return (
                  <div key={book.bookId}>
                    <div style={{
                      padding: "6px 14px", background: "#e8f0fe",
                      fontSize: 11, fontWeight: 600, color: "#1a56db",
                      borderBottom: "1px solid #d4dff7",
                      display: "flex", alignItems: "flex-start", gap: 6,
                      wordBreak: "break-word", overflowWrap: "anywhere",
                      lineHeight: 1.35,
                    }}>
                      <span>{quotaBookIcon(bookQuotaKind(book))} {book.bookName}</span>
                      <span style={{ fontSize: 9, fontWeight: 400, color: "#6b7280", flexShrink: 0 }}>
                        ({bookTaskCount} görev
                        {book.totalQuestions > 0 ? ` · ${book.totalQuestions} soru` : ""})
                      </span>
                    </div>
                    {book.units.map((unit) => (
                      <div key={`${book.bookId}-${unit.unitId}`}>
                        {!unitIsQuotaOnly(unit) && (
                        <div style={{
                          padding: "6px 14px", background: "#f0f4f8",
                          fontSize: 11, fontWeight: 600, color: "#0061a6",
                          borderBottom: "1px solid #e4e9f2",
                          wordBreak: "break-word", overflowWrap: "anywhere",
                          lineHeight: 1.35,
                        }}>
                          📂 {unit.unitName}
                        </div>
                        )}
                        {unit.topics.map((topic) => {
                          const topicQ = topic.items.reduce((s, i) => s + (i.content.questionCount || 0), 0);
                          const [leftItems, rightItems] = splitColumnMajor(topic.items);
                          return (
                            <div key={`${unit.unitId}-${topic.topicId}`}>
                              <div style={{
                                padding: "7px 14px 4px",
                                background: "#f8fafc",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#0f172a",
                                borderBottom: "1px solid #e4e9f2",
                                wordBreak: "break-word",
                                overflowWrap: "anywhere",
                                whiteSpace: "normal",
                                lineHeight: 1.35,
                              }}>
                                {topic.topicName}
                                {topicQ > 0 && (
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b", marginLeft: 6 }}>
                                    {topicQ} soru
                                  </span>
                                )}
                              </div>
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: rightItems.length > 0 ? "1fr 1fr" : "1fr",
                                gap: 0,
                                alignItems: "start",
                              }}>
                                <div style={{
                                  borderRight: rightItems.length > 0 ? "1px solid #f0f2f5" : "none",
                                }}>
                                  {leftItems.map(({ content: item, note }) => (
                                    <TestRow
                                      key={item.id}
                                      item={item}
                                      note={note}
                                      topicName={topic.topicName}
                                      taskHistory={taskHistory}
                                    />
                                  ))}
                                </div>
                                {rightItems.length > 0 && (
                                  <div>
                                    {rightItems.map(({ content: item, note }) => (
                                      <TestRow
                                        key={item.id}
                                        item={item}
                                        note={note}
                                        topicName={topic.topicName}
                                        taskHistory={taskHistory}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

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
