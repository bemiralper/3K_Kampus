// @ts-nocheck
// ========== Kaynak Kütüphanesi — Data Hook ==========
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import {
  fetchBooks,
  fetchDersler,
  fetchSinifSeviyeleri,
  fetchBookTypes,
  fetchBookStructure,
  createBookType,
  updateBookType,
  deleteBookType,
  createBook,
  updateBook,
  deleteBook,
  duplicateBook,
  uploadBookKapak,
  deleteBookKapak,
  fetchNextTestBatch,
  createUnit,
  updateUnit,
  deleteUnit,
  createTopic,
  updateTopic,
  deleteTopic,
  createContent,
  updateContent,
  deleteContent,
  reorderUnits,
  reorderTopics,
  reorderContents,
} from "@/lib/resources-api";
import type {
  ResourceBook, ResourceUnit, ResourceTopic, ResourceContent,
  Ders, SinifSeviyesi, BookType,
  BookFormData, UnitFormData, TopicFormData, ContentFormData,
  BookTypeFormData, BulkTestFormState, BulkTestItemRow, BulkUnitRow, BulkTopicRow, Toast,
} from "../types";

// ───── initial form values ─────
const CURRENT_YEAR = new Date().getFullYear();

const INITIAL_BOOK_FORM: BookFormData = {
  ad: "", kod: "", book_type: "", ders: "", sinif_seviyeleri: [],
  yayinevi: "", yazar: "", yayin_yili: String(CURRENT_YEAR), toplam_sayfa: "",
  zorluk_min: "", zorluk_max: "", isbn: "", kapak_url: "",
  aciklama: "", aktif_mi: true, sira: 0,
};

const INITIAL_UNIT_FORM: UnitFormData = {
  id: null, book: null, ad: "", kod: "", sira: 0, aciklama: "", aktif_mi: true,
};

const INITIAL_TOPIC_FORM: TopicFormData = {
  id: null, unit: null, ad: "", kod: "", sira: 0, aciklama: "", aktif_mi: true,
};

const INITIAL_CONTENT_FORM: ContentFormData = {
  id: null, topic: null, ad: "", content_type: "CUSTOM", sira: 0,
  question_count: "", difficulty: "MIXED", page_start: "", page_end: "",
  estimated_minutes: "", video_url: "", video_duration: "", aciklama: "", aktif_mi: true,
};

const INITIAL_BOOKTYPE_FORM: BookTypeFormData = {
  id: null, kod: "", ad: "", renk: "secondary", ikon: "", sira: 0,
};

const INITIAL_BULK_TEST_FORM: BulkTestFormState = {
  namingMode: "numbered",
  templatePrefix: "",
  startMode: "auto",
  startNumber: "1",
  count: "1",
  defaultQuestionCount: "15",
  defaultDifficulty: "MIXED",
};

function syncBulkTestRows(
  names: string[],
  prev: BulkTestItemRow[],
  defaultQuestionCount: string,
  defaultDifficulty: string,
): BulkTestItemRow[] {
  const byName = new Map(prev.map((r) => [r.name, r]));
  return names.map((name, i) => {
    const existing = byName.get(name) || prev[i];
    if (existing) {
      return { ...existing, name };
    }
    return {
      name,
      question_count: defaultQuestionCount,
      difficulty: defaultDifficulty,
    };
  });
}

export function useResources() {
  const { activeSube } = useKurum();
  // ───── Core data ─────
  const [books, setBooks] = useState<ResourceBook[]>([]);
  const [dersler, setDersler] = useState<Ders[]>([]);
  const [sinifSeviyeleri, setSinifSeviyeleri] = useState<SinifSeviyesi[]>([]);
  const [bookTypes, setBookTypes] = useState<BookType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ───── Filters ─────
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDers, setFilterDers] = useState("");
  const [filterSinif, setFilterSinif] = useState("");
  const [filterBookType, setFilterBookType] = useState("");
  const [filterYayinYili, setFilterYayinYili] = useState("");

  // ───── Selected book ─────
  const [selectedBook, setSelectedBook] = useState<ResourceBook | null>(null);
  const [bookStructure, setBookStructure] = useState<ResourceBook | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(false);

  // ───── Expand state ─────
  const [expandedUnits, setExpandedUnits] = useState<number[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<number[]>([]);

  // ───── Drawer ─────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"book" | "unit" | "topic" | "content">("book");
  const [drawerAction, setDrawerAction] = useState<"create" | "edit">("create");
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ───── Forms ─────
  const [bookForm, setBookForm] = useState<BookFormData>({ ...INITIAL_BOOK_FORM });
  const [unitForm, setUnitForm] = useState<UnitFormData>({ ...INITIAL_UNIT_FORM });
  const [topicForm, setTopicForm] = useState<TopicFormData>({ ...INITIAL_TOPIC_FORM });
  const [contentForm, setContentForm] = useState<ContentFormData>({ ...INITIAL_CONTENT_FORM });

  // ───── Book type modal ─────
  const [bookTypeModalOpen, setBookTypeModalOpen] = useState(false);
  const [bookTypeForm, setBookTypeForm] = useState<BookTypeFormData>({ ...INITIAL_BOOKTYPE_FORM });
  const [bookTypeLoading, setBookTypeLoading] = useState(false);

  // ───── Bulk modals ─────
  const [bulkTestOpen, setBulkTestOpen] = useState(false);
  const [bulkTestTopicId, setBulkTestTopicId] = useState<number | null>(null);
  const [bulkTestTopicName, setBulkTestTopicName] = useState("");
  const [bulkTestForm, setBulkTestForm] = useState<BulkTestFormState>({ ...INITIAL_BULK_TEST_FORM });
  const [bulkTestRows, setBulkTestRows] = useState<BulkTestItemRow[]>([]);
  const [bulkTestPreview, setBulkTestPreview] = useState<string[]>([]);
  const [bulkTestPreviewLoading, setBulkTestPreviewLoading] = useState(false);
  const [bulkTestLoading, setBulkTestLoading] = useState(false);
  const [bulkTestError, setBulkTestError] = useState<string | null>(null);

  const [bulkUnitOpen, setBulkUnitOpen] = useState(false);
  const [bulkUnitRows, setBulkUnitRows] = useState<BulkUnitRow[]>([{ id: "1", ad: "", kod: "" }]);
  const [bulkUnitLoading, setBulkUnitLoading] = useState(false);
  const [bulkUnitError, setBulkUnitError] = useState<string | null>(null);

  const [bulkTopicOpen, setBulkTopicOpen] = useState(false);
  const [bulkTopicUnitId, setBulkTopicUnitId] = useState<number | null>(null);
  const [bulkTopicUnitName, setBulkTopicUnitName] = useState("");
  const [bulkTopicRows, setBulkTopicRows] = useState<BulkTopicRow[]>([{ id: "1", ad: "", kod: "" }]);
  const [bulkTopicLoading, setBulkTopicLoading] = useState(false);
  const [bulkTopicError, setBulkTopicError] = useState<string | null>(null);

  // ───── Import ─────
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ units: number; topics: number; contents: number } | null>(null);

  // ───── Duplicate ─────
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateForm, setDuplicateForm] = useState({ ad: "", kod: "" });
  const [duplicateLoading, setDuplicateLoading] = useState(false);

  // ───── Toast ─────
  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = useCallback((message: string, type: Toast["type"] = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ═══════ FETCH ═══════
  const fetchBooksList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBooks({
        ders: filterDers || undefined,
        sinif_seviyesi: filterSinif || undefined,
        book_type: filterBookType || undefined,
        yayin_yili: filterYayinYili || undefined,
        search: searchTerm || undefined,
      });
      if (result.success && result.data) setBooks(result.data as ResourceBook[]);
      else setError(result.error || "Kitaplar yüklenemedi");
    } catch {
      setError("Kitaplar yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [filterDers, filterSinif, filterBookType, filterYayinYili, searchTerm]);

  const fetchMetadata = useCallback(async () => {
    try {
      const [d, s, b] = await Promise.all([
        fetchDersler(),
        fetchSinifSeviyeleri(),
        fetchBookTypes(),
      ]);
      if (d.success && d.data) setDersler(d.data);
      if (s.success && s.data) setSinifSeviyeleri(s.data);
      if (b.success && b.data) setBookTypes(b.data);
    } catch {
      console.error("Metadata yüklenemedi");
    }
  }, []);

  const fetchBookStructureData = useCallback(async (bookId: number) => {
    setLoadingStructure(true);
    try {
      const result = await fetchBookStructure(bookId);
      if (result.success && result.data) setBookStructure(result.data as unknown as ResourceBook);
    } catch {
      console.error("Kitap yapısı yüklenemedi");
    } finally {
      setLoadingStructure(false);
    }
  }, []);

  useEffect(() => { fetchBooksList(); fetchMetadata(); }, [fetchBooksList, fetchMetadata]);
  useEffect(() => {
    // Şube değişince listeyi yenile (aktif şube kataloğu)
    setSelectedBook(null);
    setBookStructure(null);
    fetchBooksList();
    fetchMetadata();
  }, [activeSube?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedBook) fetchBookStructureData(selectedBook.id); }, [selectedBook, fetchBookStructureData]);

  // ═══════ TOGGLE ═══════
  const toggleUnit = (id: number) => setExpandedUnits(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleTopic = (id: number) => setExpandedTopics(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const expandAll = () => {
    if (!bookStructure?.units) return;
    const uIds = bookStructure.units.map(u => u.id);
    const tIds = bookStructure.units.flatMap(u => (u.topics || []).map(t => t.id));
    setExpandedUnits(uIds);
    setExpandedTopics(tIds);
  };
  const collapseAll = () => { setExpandedUnits([]); setExpandedTopics([]); };

  // ═══════ BOOK TYPE ═══════
  const resetBookTypeForm = () => setBookTypeForm({ ...INITIAL_BOOKTYPE_FORM });

  const openBookTypeForEdit = (bt: BookType) => {
    setBookTypeForm({ id: bt.id, kod: bt.kod, ad: bt.ad, renk: bt.renk, ikon: bt.ikon, sira: 0 });
  };

  const saveBookType = async () => {
    if (!bookTypeForm.kod || !bookTypeForm.ad) { showToast("❌ Kod ve Ad alanları zorunludur", "error"); return; }
    setBookTypeLoading(true);
    try {
      const payload = { kod: bookTypeForm.kod, ad: bookTypeForm.ad, renk: bookTypeForm.renk, ikon: bookTypeForm.ikon, sira: bookTypeForm.sira };
      const result = bookTypeForm.id !== null
        ? await updateBookType(bookTypeForm.id, payload)
        : await createBookType(payload);
      if (result.success) { resetBookTypeForm(); fetchMetadata(); showToast("✅ Kitap türü kaydedildi"); }
      else showToast(`❌ ${result.error || "Kayıt hatası"}`, "error");
    } catch { showToast("❌ Kayıt sırasında hata oluştu", "error"); }
    finally { setBookTypeLoading(false); }
  };

  const deleteBookTypeHandler = async (id: number) => {
    if (!confirm("⚠️ Bu türü silmek istediğinize emin misiniz?\nBu işlem geri alınamaz!")) return;
    try {
      const result = await deleteBookType(id);
      if (result.success) { fetchMetadata(); showToast("✅ Tür silindi"); }
      else showToast(`❌ ${result.error || "Silme hatası"}`, "error");
    } catch { showToast("❌ Silme hatası", "error"); }
  };

  // ═══════ DRAWER OPEN ═══════
  const pendingKapakRef = useRef<File | null>(null);

  const resetBookForm = () => {
    setBookForm({ ...INITIAL_BOOK_FORM, yayin_yili: String(CURRENT_YEAR) });
    setEditingId(null);
  };
  const resetUnitForm = () => setUnitForm({ ...INITIAL_UNIT_FORM, book: selectedBook?.id || null });
  const resetTopicForm = () => setTopicForm({ ...INITIAL_TOPIC_FORM });
  const resetContentForm = () => setContentForm({ ...INITIAL_CONTENT_FORM });

  const openBookDrawer = (action: "create" | "edit", book?: ResourceBook) => {
    setDrawerMode("book"); setDrawerAction(action); setDrawerError(null);
    pendingKapakRef.current = null;
    if (action === "edit" && book) {
      setEditingId(book.id);
      const levels = book.sinif_seviyeleri?.length
        ? book.sinif_seviyeleri
        : book.sinif_seviyesi
          ? [book.sinif_seviyesi]
          : [];
      setBookForm({
        ad: book.ad, kod: book.kod, book_type: String(book.book_type),
        ders: String(book.ders), sinif_seviyeleri: levels,
        yayinevi: book.yayinevi || "", yazar: book.yazar || "",
        yayin_yili: book.yayin_yili ? String(book.yayin_yili) : String(CURRENT_YEAR),
        toplam_sayfa: book.toplam_sayfa ? String(book.toplam_sayfa) : "",
        zorluk_min: book.zorluk_min != null ? String(book.zorluk_min) : "",
        zorluk_max: book.zorluk_max != null ? String(book.zorluk_max) : "",
        isbn: "", kapak_url: book.kapak_url || "", aciklama: book.aciklama || "",
        aktif_mi: book.aktif_mi, sira: 0,
      });
    } else {
      resetBookForm();
    }
    setDrawerOpen(true);
  };

  const openUnitDrawer = (action: "create" | "edit", unit?: ResourceUnit) => {
    setDrawerMode("unit"); setDrawerAction(action); setDrawerError(null);
    if (action === "edit" && unit) {
      setUnitForm({ id: unit.id, book: selectedBook?.id || null, ad: unit.ad, kod: unit.kod, sira: unit.sira, aciklama: "", aktif_mi: unit.aktif_mi });
    } else resetUnitForm();
    setDrawerOpen(true);
  };

  const openTopicDrawer = (action: "create" | "edit", unitId: number, topic?: ResourceTopic) => {
    setDrawerMode("topic"); setDrawerAction(action); setDrawerError(null);
    if (action === "edit" && topic) {
      setTopicForm({ id: topic.id, unit: unitId, ad: topic.ad, kod: topic.kod, sira: topic.sira, aciklama: "", aktif_mi: topic.aktif_mi });
    } else setTopicForm({ ...INITIAL_TOPIC_FORM, unit: unitId });
    setDrawerOpen(true);
  };

  const openContentDrawer = (action: "create" | "edit", topicId: number, content?: ResourceContent) => {
    setDrawerMode("content"); setDrawerAction(action); setDrawerError(null);
    if (action === "edit" && content) {
      setContentForm({
        id: content.id, topic: topicId, ad: content.ad, content_type: content.content_type,
        sira: content.sira,
        question_count: content.question_count ? String(content.question_count) : "",
        difficulty: content.difficulty || "MIXED",
        page_start: content.page_start ? String(content.page_start) : "",
        page_end: content.page_end ? String(content.page_end) : "",
        estimated_minutes: content.estimated_minutes ? String(content.estimated_minutes) : "",
        video_url: content.video_url || "", video_duration: "", aciklama: "", aktif_mi: content.aktif_mi,
      });
    } else setContentForm({ ...INITIAL_CONTENT_FORM, topic: topicId });
    setDrawerOpen(true);
  };

  // ═══════ SAVE HANDLERS ═══════
  const setPendingKapakFile = (file: File | null) => {
    pendingKapakRef.current = file;
  };

  const handleUploadKapak = async (file: File): Promise<string | null> => {
    if (!editingId) return null;
    const result = await uploadBookKapak(editingId, file);
    if (!result.success) {
      setDrawerError(result.error || "Kapak yüklenemedi");
      showToast(`❌ ${result.error || "Kapak yüklenemedi"}`, "error");
      return null;
    }
    // apiPostForm { success, data: { kapak_url } } veya düz gövde
    const payload = result.data as { kapak_url?: string } | undefined;
    const url =
      payload?.kapak_url
      || (result as { kapak_url?: string }).kapak_url
      || "";
    const withBust = url ? `${url.split("?")[0]}?t=${Date.now()}` : "";
    await fetchBooksList();
    showToast("✅ Kapak yüklendi");
    return withBust || url || null;
  };

  const handleDeleteKapak = async (): Promise<boolean> => {
    if (!editingId) return false;
    const result = await deleteBookKapak(editingId);
    if (!result.success) {
      setDrawerError(result.error || "Kapak silinemedi");
      showToast(`❌ ${result.error || "Kapak silinemedi"}`, "error");
      return false;
    }
    fetchBooksList();
    showToast("✅ Kapak kaldırıldı");
    return true;
  };

  const handleSaveBook = async () => {
    setDrawerLoading(true); setDrawerError(null);
    try {
      if (!bookForm.sinif_seviyeleri.length) {
        setDrawerError("En az bir sınıf seviyesi seçin.");
        setDrawerLoading(false);
        return;
      }
      const body = {
        ad: bookForm.ad,
        book_type: parseInt(bookForm.book_type, 10),
        ders: parseInt(bookForm.ders),
        sinif_seviyeleri: bookForm.sinif_seviyeleri,
        sinif_seviyesi: bookForm.sinif_seviyeleri[0],
        yayinevi: bookForm.yayinevi,
        yazar: bookForm.yazar,
        yayin_yili: bookForm.yayin_yili ? parseInt(bookForm.yayin_yili) : null,
        toplam_sayfa: bookForm.toplam_sayfa ? parseInt(bookForm.toplam_sayfa) : null,
        zorluk_min: bookForm.zorluk_min !== "" ? parseInt(bookForm.zorluk_min, 10) : null,
        zorluk_max: bookForm.zorluk_max !== "" ? parseInt(bookForm.zorluk_max, 10) : null,
        isbn: bookForm.isbn,
        aciklama: bookForm.aciklama,
        aktif_mi: bookForm.aktif_mi,
        sira: bookForm.sira,
      };
      const result = editingId
        ? await updateBook(editingId, body)
        : await createBook(body);
      if (result.success) {
        const newId = editingId || result.data?.id;
        const pending = pendingKapakRef.current;
        if (newId && pending) {
          const kapakResult = await uploadBookKapak(newId, pending);
          pendingKapakRef.current = null;
          if (!kapakResult.success) {
            showToast(`⚠️ Kitap kaydedildi ancak kapak yüklenemedi: ${kapakResult.error || ""}`, "error");
          }
        }
        setDrawerOpen(false); fetchBooksList();
        if (selectedBook && editingId === selectedBook.id) fetchBookStructureData(selectedBook.id);
        showToast(`✅ Kitap ${editingId ? "güncellendi" : "oluşturuldu"}`);
      } else setDrawerError(typeof result.error === "object" ? JSON.stringify(result.error) : (result.error ?? "Hata"));
    } catch { setDrawerError("Kayıt sırasında hata oluştu"); }
    finally { setDrawerLoading(false); }
  };

  const buildUnitPayload = () => {
    const { id, kod, book, ...rest } = unitForm;
    return { ...rest, book: selectedBook?.id };
  };

  const handleSaveUnit = async () => {
    setDrawerLoading(true); setDrawerError(null);
    try {
      if (!selectedBook?.id) {
        setDrawerError("Kitap seçilmedi");
        setDrawerLoading(false);
        return;
      }
      const payload = buildUnitPayload();
      const result = unitForm.id
        ? await updateUnit(unitForm.id, payload)
        : await createUnit(payload as Parameters<typeof createUnit>[0]);
      if (result.success) { setDrawerOpen(false); if (selectedBook) fetchBookStructureData(selectedBook.id); showToast("✅ Ünite kaydedildi"); }
      else setDrawerError(typeof result.error === "object" ? JSON.stringify(result.error) : (result.error ?? "Hata"));
    } catch { setDrawerError("Kayıt sırasında hata oluştu"); }
    finally { setDrawerLoading(false); }
  };

  const handleSaveTopic = async () => {
    setDrawerLoading(true); setDrawerError(null);
    try {
      const { id, kod, unit, ...rest } = topicForm;
      const topicPayload = { ...rest, unit: unit ?? undefined };
      const result = topicForm.id
        ? await updateTopic(topicForm.id, topicPayload)
        : await createTopic(topicPayload as Parameters<typeof createTopic>[0]);
      if (result.success) { setDrawerOpen(false); if (selectedBook) fetchBookStructureData(selectedBook.id); showToast("✅ Konu kaydedildi"); }
      else setDrawerError(typeof result.error === "object" ? JSON.stringify(result.error) : (result.error ?? "Hata"));
    } catch { setDrawerError("Kayıt sırasında hata oluştu"); }
    finally { setDrawerLoading(false); }
  };

  const handleSaveContent = async () => {
    setDrawerLoading(true); setDrawerError(null);
    try {
      const body = {
        ...contentForm,
        question_count: contentForm.question_count ? parseInt(contentForm.question_count) : null,
        page_start: contentForm.page_start ? parseInt(contentForm.page_start) : null,
        page_end: contentForm.page_end ? parseInt(contentForm.page_end) : null,
        estimated_minutes: contentForm.estimated_minutes ? parseInt(contentForm.estimated_minutes) : null,
        video_duration: contentForm.video_duration ? parseInt(contentForm.video_duration) : null,
      };
      const result = contentForm.id
        ? await updateContent(contentForm.id, body)
        : await createContent(body as Parameters<typeof createContent>[0]);
      if (result.success) { setDrawerOpen(false); if (selectedBook) fetchBookStructureData(selectedBook.id); showToast("✅ İçerik kaydedildi"); }
      else setDrawerError(typeof result.error === "object" ? JSON.stringify(result.error) : (result.error ?? "Hata"));
    } catch { setDrawerError("Kayıt sırasında hata oluştu"); }
    finally { setDrawerLoading(false); }
  };

  const handleDrawerSave = () => {
    if (drawerMode === "book") handleSaveBook();
    else if (drawerMode === "unit") handleSaveUnit();
    else if (drawerMode === "topic") handleSaveTopic();
    else if (drawerMode === "content") handleSaveContent();
  };

  // ═══════ DELETE HANDLERS ═══════
  const handleDeleteBook = async (bookId: number) => {
    if (!confirm("⚠️ Bu kitabı silmek istediğinize emin misiniz?\nTüm üniteler, konular ve içerikler de silinecektir!")) return;
    try {
      const result = await deleteBook(bookId);
      if (result.success) {
        fetchBooksList();
        if (selectedBook?.id === bookId) { setSelectedBook(null); setBookStructure(null); }
        showToast("✅ Kitap silindi");
      } else showToast(`❌ ${result.error || "Silme hatası"}`, "error");
    } catch { showToast("❌ Silme sırasında hata oluştu", "error"); }
  };

  const handleDeleteUnit = async (unitId: number) => {
    if (!confirm("⚠️ Bu üniteyi ve altındaki tüm konuları silmek istediğinize emin misiniz?")) return;
    try {
      const result = await deleteUnit(unitId);
      if (result.success) { if (selectedBook) fetchBookStructureData(selectedBook.id); showToast("✅ Ünite silindi"); }
      else showToast(`❌ ${result.error || "Ünite silinemedi"}`, "error");
    } catch { showToast("❌ Silme hatası", "error"); }
  };

  const handleDeleteTopic = async (topicId: number) => {
    if (!confirm("⚠️ Bu konuyu ve altındaki tüm içerikleri silmek istediğinize emin misiniz?")) return;
    try {
      const result = await deleteTopic(topicId);
      if (result.success) { if (selectedBook) fetchBookStructureData(selectedBook.id); showToast("✅ Konu silindi"); }
      else showToast(`❌ ${result.error || "Konu silinemedi"}`, "error");
    } catch { showToast("❌ Silme hatası", "error"); }
  };

  const handleDeleteContent = async (contentId: number) => {
    if (!confirm("⚠️ Bu içeriği silmek istediğinize emin misiniz?")) return;
    try {
      const result = await deleteContent(contentId);
      if (result.success) { if (selectedBook) fetchBookStructureData(selectedBook.id); showToast("✅ İçerik silindi"); }
      else showToast(`❌ ${result.error || "İçerik silinemedi"}`, "error");
    } catch { showToast("❌ Silme hatası", "error"); }
  };

  // ═══════ DUPLICATE BOOK ═══════
  const openDuplicateModal = (book: ResourceBook) => {
    setDuplicateForm({ ad: `${book.ad} (Kopya)`, kod: `${book.kod}_COPY` });
    setDuplicateModalOpen(true);
  };

  const handleDuplicateBook = async () => {
    if (!selectedBook) return;
    setDuplicateLoading(true);
    try {
      const result = await duplicateBook(selectedBook.id, duplicateForm);
      if (result.success) {
        setDuplicateModalOpen(false);
        fetchBooksList();
        showToast(`✅ ${result.message || "Kitap kopyalandı"}`);
      } else showToast(`❌ ${result.error || "Kopyalama hatası"}`, "error");
    } catch { showToast("❌ Kopyalama sırasında hata oluştu", "error"); }
    finally { setDuplicateLoading(false); }
  };

  // ═══════ REORDER (drag-drop) ═══════
  const reorderUnitsHandler = async (orderedIds: number[]) => {
    try {
      const result = await reorderUnits(orderedIds);
      if (result.success && selectedBook) fetchBookStructureData(selectedBook.id);
    } catch { showToast("❌ Sıralama hatası", "error"); }
  };

  const reorderTopicsHandler = async (orderedIds: number[]) => {
    try {
      const result = await reorderTopics(orderedIds);
      if (result.success && selectedBook) fetchBookStructureData(selectedBook.id);
    } catch { showToast("❌ Sıralama hatası", "error"); }
  };

  const reorderContentsHandler = async (orderedIds: number[]) => {
    try {
      const result = await reorderContents(orderedIds);
      if (result.success && selectedBook) fetchBookStructureData(selectedBook.id);
    } catch { showToast("❌ Sıralama hatası", "error"); }
  };

  // ═══════ BULK TESTS ═══════
  const bulkTestPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bulkTestPreviewRequestRef = useRef(0);

  const refreshBulkTestPreview = useCallback(async (topicId: number, form: BulkTestFormState) => {
    const count = parseInt(form.count, 10);
    if (!topicId || !count || count < 1) {
      setBulkTestPreview([]);
      setBulkTestRows([]);
      setBulkTestPreviewLoading(false);
      return;
    }
    if (form.namingMode === "series" && !form.templatePrefix.trim()) {
      setBulkTestPreview([]);
      setBulkTestRows([]);
      setBulkTestPreviewLoading(false);
      return;
    }

    const requestId = ++bulkTestPreviewRequestRef.current;
    setBulkTestPreviewLoading(true);
    try {
      const result = await fetchNextTestBatch({
        topic: topicId,
        count,
        mode: form.namingMode,
        prefix: form.namingMode === "series" ? form.templatePrefix.trim() : undefined,
        start: form.startMode === "auto" ? "auto" : parseInt(form.startNumber, 10) || 1,
      });
      if (requestId !== bulkTestPreviewRequestRef.current) return;
      if (result.success && result.data?.names) {
        setBulkTestPreview(result.data.names);
        setBulkTestRows((prev) => syncBulkTestRows(
          result.data!.names,
          prev,
          form.defaultQuestionCount,
          form.defaultDifficulty,
        ));
      } else {
        setBulkTestPreview([]);
        setBulkTestRows([]);
      }
    } catch {
      if (requestId === bulkTestPreviewRequestRef.current) {
        setBulkTestPreview([]);
        setBulkTestRows([]);
      }
    } finally {
      if (requestId === bulkTestPreviewRequestRef.current) {
        setBulkTestPreviewLoading(false);
      }
    }
  }, []);

  const scheduleBulkTestPreview = useCallback((
    topicId: number,
    form: BulkTestFormState,
    immediate = false,
  ) => {
    if (bulkTestPreviewTimerRef.current) {
      clearTimeout(bulkTestPreviewTimerRef.current);
    }
    if (immediate) {
      void refreshBulkTestPreview(topicId, form);
      return;
    }
    bulkTestPreviewTimerRef.current = setTimeout(() => {
      void refreshBulkTestPreview(topicId, form);
    }, 450);
  }, [refreshBulkTestPreview]);

  useEffect(() => () => {
    if (bulkTestPreviewTimerRef.current) clearTimeout(bulkTestPreviewTimerRef.current);
  }, []);

  const openBulkTestModal = (topicId: number, topicName: string) => {
    setBulkTestTopicId(topicId);
    setBulkTestTopicName(topicName);
    const initial = { ...INITIAL_BULK_TEST_FORM };
    setBulkTestForm(initial);
    setBulkTestPreview([]);
    setBulkTestRows([]);
    setBulkTestPreviewLoading(false);
    setBulkTestError(null);
    setBulkTestOpen(true);
    scheduleBulkTestPreview(topicId, initial, true);
  };

  const updateBulkTestForm = (next: BulkTestFormState, immediate = false) => {
    setBulkTestForm(next);
    if (bulkTestTopicId) scheduleBulkTestPreview(bulkTestTopicId, next, immediate);
  };

  const updateBulkTestRow = (index: number, field: "question_count" | "difficulty", value: string) => {
    setBulkTestRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const applyDefaultQuestionToAll = () => {
    setBulkTestRows((rows) => rows.map((row) => ({
      ...row,
      question_count: bulkTestForm.defaultQuestionCount,
      difficulty: bulkTestForm.defaultDifficulty,
    })));
  };

  const submitBulkTests = async () => {
    if (!bulkTestTopicId) return;
    if (!bulkTestRows.length) {
      setBulkTestError("En az bir test eklemelisiniz");
      return;
    }
    if (bulkTestForm.namingMode === "series" && !bulkTestForm.templatePrefix.trim()) {
      setBulkTestError("Şablon adı girin");
      return;
    }
    const invalid = bulkTestRows.find((r) => !r.question_count || parseInt(r.question_count, 10) < 1);
    if (invalid) {
      setBulkTestError(`"${invalid.name}" için geçerli soru sayısı girin`);
      return;
    }
    setBulkTestLoading(true);
    setBulkTestError(null);
    try {
      const batchResult = await fetchNextTestBatch({
        topic: bulkTestTopicId,
        count: bulkTestRows.length,
        mode: bulkTestForm.namingMode,
        prefix: bulkTestForm.namingMode === "series" ? bulkTestForm.templatePrefix.trim() : undefined,
        start: bulkTestForm.startMode === "auto" ? "auto" : parseInt(bulkTestForm.startNumber, 10) || 1,
      });
      if (!batchResult.success || !batchResult.data?.names?.length) {
        setBulkTestError(batchResult.error || "Test adları üretilemedi");
        return;
      }
      const { next_sira: nextSira } = batchResult.data;
      const results = await Promise.all(bulkTestRows.map((row, i) =>
        createContent({
          topic: bulkTestTopicId,
          ad: row.name,
          content_type: "TEST_SET",
          sira: nextSira + i,
          question_count: parseInt(row.question_count, 10),
          difficulty: row.difficulty,
          aktif_mi: true,
        })
      ));
      if (results.every((r) => r.success)) {
        setBulkTestOpen(false);
        if (selectedBook) await fetchBookStructureData(selectedBook.id);
        showToast(`✅ ${bulkTestRows.length} test eklendi`);
      } else {
        setBulkTestError("Bazı testler eklenemedi");
      }
    } catch {
      setBulkTestError("Testler eklenirken hata oluştu");
    } finally {
      setBulkTestLoading(false);
    }
  };

  // ═══════ BULK UNITS ═══════
  const openBulkUnitModal = () => {
    if (!selectedBook) return;
    setBulkUnitRows([{ id: "1", ad: "", kod: "" }]); setBulkUnitError(null); setBulkUnitOpen(true);
  };

  const submitBulkUnits = async () => {
    if (!selectedBook) return;
    const valid = bulkUnitRows.filter(r => r.ad.trim());
    if (!valid.length) { setBulkUnitError("En az bir ünite eklemelisiniz"); return; }
    setBulkUnitLoading(true); setBulkUnitError(null);
    try {
      const existing = selectedBook.units?.length || 0;
      let failed = 0;
      for (let i = 0; i < valid.length; i++) {
        const row = valid[i];
        const result = await createUnit({
          book: selectedBook.id,
          ad: row.ad.trim(),
          sira: existing + i + 1,
          aktif_mi: true,
        });
        if (!result.success) failed++;
      }
      if (failed === 0) {
        setBulkUnitOpen(false); await fetchBookStructureData(selectedBook.id);
        showToast(`✅ ${valid.length} ünite eklendi`);
      } else setBulkUnitError(`${failed} ünite eklenemedi`);
    } catch { setBulkUnitError("Üniteler eklenirken hata oluştu"); }
    finally { setBulkUnitLoading(false); }
  };

  // ═══════ BULK TOPICS ═══════
  const openBulkTopicModal = (unitId: number, unitName: string) => {
    setBulkTopicUnitId(unitId); setBulkTopicUnitName(unitName);
    setBulkTopicRows([{ id: "1", ad: "", kod: "" }]); setBulkTopicError(null); setBulkTopicOpen(true);
  };

  const submitBulkTopics = async () => {
    if (!bulkTopicUnitId || !selectedBook) return;
    const valid = bulkTopicRows.filter(r => r.ad.trim());
    if (!valid.length) { setBulkTopicError("En az bir konu eklemelisiniz"); return; }
    setBulkTopicLoading(true); setBulkTopicError(null);
    try {
      const unit = selectedBook.units?.find(u => u.id === bulkTopicUnitId);
      const existing = unit?.topics?.length || 0;
      let failed = 0;
      for (let i = 0; i < valid.length; i++) {
        const row = valid[i];
        const result = await createTopic({
          unit: bulkTopicUnitId,
          ad: row.ad.trim(),
          sira: existing + i + 1,
          aktif_mi: true,
        });
        if (!result.success) failed++;
      }
      if (failed === 0) {
        setBulkTopicOpen(false); await fetchBookStructureData(selectedBook.id);
        showToast(`✅ ${valid.length} konu eklendi`);
      } else setBulkTopicError(`${failed} konu eklenemedi`);
    } catch { setBulkTopicError("Konular eklenirken hata oluştu"); }
    finally { setBulkTopicLoading(false); }
  };

  // ═══════ IMPORT ═══════
  const handleImportStructure = async () => {
    if (!selectedBook || !importText.trim()) return;
    setImportLoading(true); setImportError(null); setImportResult(null);
    try {
      const lines = importText.trim().split("\n").filter(l => l.trim());
      let unitCount = 0, topicCount = 0, contentCount = 0;
      let currentUnitId: number | null = null;
      let currentTopicId: number | null = null;
      let unitOrder = (bookStructure?.units?.length || 0) + 1;
      let topicOrder = 1;
      let contentOrder = 1;

      for (const line of lines) {
        const trimmed = line.trim();
        const tabCount = line.split("\t").length - 1;
        const indent = line.length - line.trimStart().length;
        const level = tabCount > 0 ? tabCount : Math.floor(indent / 2);
        const parts = trimmed.includes("|") ? trimmed.split("|").map(p => p.trim()) : trimmed.split("\t").map(p => p.trim());
        const name = parts[0];

        if (level === 0) {
          const result = await createUnit({
            book: selectedBook.id,
            ad: name,
            sira: unitOrder,
            aktif_mi: true,
          });
          if (result.success && result.data?.id) { currentUnitId = result.data.id; unitCount++; unitOrder++; topicOrder = 1; currentTopicId = null; }
          else throw new Error(`Ünite oluşturulamadı: ${name}`);
        } else if (level === 1) {
          if (!currentUnitId) { setImportError(`"${name}" konusu için üst ünite bulunamadı.`); return; }
          const result = await createTopic({
            unit: currentUnitId,
            ad: name,
            sira: topicOrder,
            aktif_mi: true,
          });
          if (result.success && result.data?.id) { currentTopicId = result.data.id; topicCount++; topicOrder++; contentOrder = 1; }
          else throw new Error(`Konu oluşturulamadı: ${name}`);
        } else {
          if (!currentTopicId) { setImportError(`"${name}" içeriği için üst konu bulunamadı.`); return; }
          const qCount = parts[2] ? parseInt(parts[2]) || null : null;
          const result = await createContent({
            topic: currentTopicId,
            ad: name,
            content_type: "TEST_SET",
            question_count: qCount,
            sira: contentOrder,
            aktif_mi: true,
          });
          if (result.success) { contentCount++; contentOrder++; }
          else throw new Error(`İçerik oluşturulamadı: ${name}`);
        }
      }
      setImportResult({ units: unitCount, topics: topicCount, contents: contentCount });
      fetchBookStructureData(selectedBook.id);
      showToast(`✅ ${unitCount} ünite, ${topicCount} konu, ${contentCount} içerik eklendi`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "İçe aktarma sırasında hata oluştu");
    } finally { setImportLoading(false); }
  };

  // ═══════ FILTERED BOOKS ═══════
  const filteredBooks = books.filter(b =>
    b.ad.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.kod.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return {
    // Data
    books, filteredBooks, dersler, sinifSeviyeleri, bookTypes,
    loading, error, selectedBook, setSelectedBook,
    bookStructure, setBookStructure, loadingStructure,
    // Filters
    searchTerm, setSearchTerm, filterDers, setFilterDers,
    filterSinif, setFilterSinif, filterBookType, setFilterBookType,
    filterYayinYili, setFilterYayinYili,
    // Expand
    expandedUnits, expandedTopics, toggleUnit, toggleTopic, expandAll, collapseAll,
    // Drawer
    drawerOpen, setDrawerOpen, drawerMode, drawerAction, drawerLoading, drawerError, editingId,
    bookForm, setBookForm, unitForm, setUnitForm, topicForm, setTopicForm, contentForm, setContentForm,
    openBookDrawer, openUnitDrawer, openTopicDrawer, openContentDrawer, handleDrawerSave,
    handleUploadKapak, handleDeleteKapak, setPendingKapakFile,
    // Book type
    bookTypeModalOpen, setBookTypeModalOpen, bookTypeForm, setBookTypeForm, bookTypeLoading,
    resetBookTypeForm, openBookTypeForEdit, saveBookType, deleteBookType: deleteBookTypeHandler,
    // Bulk test
    bulkTestOpen, setBulkTestOpen, bulkTestTopicName, bulkTestForm, setBulkTestForm: updateBulkTestForm,
    bulkTestRows, updateBulkTestRow, applyDefaultQuestionToAll,
    bulkTestPreview, bulkTestPreviewLoading, bulkTestLoading, bulkTestError,
    openBulkTestModal, submitBulkTests,
    // Bulk unit
    bulkUnitOpen, setBulkUnitOpen, bulkUnitRows, setBulkUnitRows, bulkUnitLoading, bulkUnitError, openBulkUnitModal, submitBulkUnits,
    // Bulk topic
    bulkTopicOpen, setBulkTopicOpen, bulkTopicUnitName, bulkTopicRows, setBulkTopicRows, bulkTopicLoading, bulkTopicError, openBulkTopicModal, submitBulkTopics,
    // Import
    importModalOpen, setImportModalOpen, importText, setImportText, importLoading, importError, importResult, handleImportStructure,
    // Duplicate
    duplicateModalOpen, setDuplicateModalOpen, duplicateForm, setDuplicateForm, duplicateLoading, openDuplicateModal, handleDuplicateBook,
    // Delete
    handleDeleteBook, handleDeleteUnit, handleDeleteTopic, handleDeleteContent,
    // Reorder
    reorderUnits: reorderUnitsHandler, reorderTopics: reorderTopicsHandler, reorderContents: reorderContentsHandler,
    // Toast
    toast,
    // Fetch (for refresh)
    fetchBooks: fetchBooksList, fetchBookStructure: fetchBookStructureData,
  };
}
