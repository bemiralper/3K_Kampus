'use client';

import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { studentPortalApi } from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';

export default function NoteSplitViewer() {
  const { splitNote, closeSplitNote } = useStudentPortal();
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!splitNote) return;
    let cancelled = false;
    setCurrentPage(1);
    setZoom(100);
    setPreviewError(null);

    if (!splitNote.is_pdf && !splitNote.is_image) {
      setPageCount(0);
      return;
    }

    setLoading(true);
    studentPortalApi
      .notePreviewCatalog(splitNote.id)
      .then((res) => {
        if (!cancelled) {
          setPageCount(res.page_count || 1);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : 'Önizleme hazırlanamadı.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [splitNote]);

  if (!splitNote) return null;

  return (
    <aside className="sp-split-pane" aria-label="Ders Notu Görüntüleyici">
      <header className="sp-split-header">
        <div className="sp-split-title">
          <span
            className="sp-dot"
            style={{ backgroundColor: splitNote.color || '#6366f1' }}
          />
          <div>
            <strong>{splitNote.title}</strong>
            <span>
              {splitNote.course_name} · {splitNote.teacher_name}
            </span>
          </div>
        </div>
        <div className="sp-split-actions">
          <a
            href={studentPortalApi.noteOpenUrl(splitNote.id, false)}
            target="_blank"
            rel="noreferrer"
            className="sp-icon-btn"
            title="Yeni sekmede aç"
          >
            <ExternalLink size={16} />
          </a>
          <a
            href={studentPortalApi.noteOpenUrl(splitNote.id, true)}
            className="sp-icon-btn"
            title="Cihaza indir"
          >
            <Download size={16} />
          </a>
          <button
            type="button"
            className="sp-icon-btn"
            onClick={closeSplitNote}
            title="Yan paneli kapat"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      {pageCount > 0 ? (
        <div className="sp-split-toolbar">
          <div className="sp-split-pager">
            <button
              type="button"
              className="sp-icon-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Sayfa {currentPage} / {pageCount}
            </span>
            <button
              type="button"
              className="sp-icon-btn"
              disabled={currentPage >= pageCount}
              onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="sp-split-zoom">
            <button
              type="button"
              className="sp-icon-btn"
              onClick={() => setZoom((z) => Math.max(75, z - 20))}
              title="Uzaklaştır"
            >
              <ZoomOut size={15} />
            </button>
            <span>%{zoom}</span>
            <button
              type="button"
              className="sp-icon-btn"
              onClick={() => setZoom((z) => Math.min(180, z + 20))}
              title="Yakınlaştır"
            >
              <ZoomIn size={15} />
            </button>
          </div>
        </div>
      ) : null}

      <div className="sp-split-stage">
        {loading ? (
          <div className="sp-empty-box">
            <p>Ders notu sayfaları hazırlanıyor…</p>
          </div>
        ) : previewError ? (
          <div className="sp-empty-box">
            <FileText size={32} />
            <p>{previewError}</p>
            <a
              href={studentPortalApi.noteOpenUrl(splitNote.id, true)}
              className="sp-btn sp-btn-primary sp-btn-sm"
            >
              <Download size={15} /> Dosyayı İndir
            </a>
          </div>
        ) : pageCount > 0 ? (
          <div className="sp-split-page-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={studentPortalApi.notePreviewPageUrl(splitNote.id, currentPage)}
              alt={`${splitNote.title} — Sayfa ${currentPage}`}
              style={{ width: `${zoom}%`, maxWidth: 'none' }}
              className="sp-split-page-img"
            />
          </div>
        ) : (
          <div className="sp-empty-box">
            <FileText size={34} />
            <p>
              Bu dosya türü doğrudan indirilebilir ({splitNote.file_name || splitNote.mime_type}).
            </p>
            <a
              href={studentPortalApi.noteOpenUrl(splitNote.id, true)}
              className="sp-btn sp-btn-primary sp-btn-sm"
            >
              <Download size={15} /> Dosyayı İndir
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}
