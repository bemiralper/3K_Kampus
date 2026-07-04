'use client';

import { useEffect, useState, useCallback } from 'react';
import { curriculumApi } from '../../../../components/olcme/api';
import type { SubjectItem, TopicItem, OutcomeItem, SubOutcomeItem } from '../../../../components/olcme/types';
import styles from './kazanimlar.module.css';

/* ── Yardımcı ─────────────────────────────────────────────────────────────── */
const EXAM_TYPE_OPTIONS = [
  { value: '', label: 'Tüm Dersler' },
  { value: 'YKS_TYT', label: 'TYT' },
  { value: 'YKS_AYT', label: 'AYT' },
  { value: 'LGS', label: 'LGS' },
];

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function KazanimlarPage() {
  /* ── State ── */
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [examTypeFilter, setExamTypeFilter] = useState('');

  // Ağaç açma/kapama durumları
  const [openTopics, setOpenTopics] = useState<Set<number>>(new Set());
  const [openOutcomes, setOpenOutcomes] = useState<Set<number>>(new Set());

  // Modal/Form state'leri
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ message: string; stats: { topics: number; outcomes: number; sub_outcomes: number } } | null>(null);

  // Yeni ders
  const [showNewSubject, setShowNewSubject] = useState(false);
  const [newSubjectForm, setNewSubjectForm] = useState({ code: '', name: '', display_name: '', exam_type_filter: 'ALL' });

  // Düzenleme
  const [editingTopic, setEditingTopic] = useState<{ id: number; code: string; name: string } | null>(null);
  const [editingOutcome, setEditingOutcome] = useState<{ id: number; topicId: number; code: string; text: string } | null>(null);
  const [editingSubOutcome, setEditingSubOutcome] = useState<{ id: number; outcomeId: number; topicId: number; code: string; text: string } | null>(null);

  // Yeni ekleme
  const [addingTopicTo, setAddingTopicTo] = useState<number | null>(null); // subject_id
  const [newTopicForm, setNewTopicForm] = useState({ code: '', name: '' });
  const [addingOutcomeTo, setAddingOutcomeTo] = useState<number | null>(null); // topic_id
  const [newOutcomeForm, setNewOutcomeForm] = useState({ code: '', text: '' });
  const [addingSubOutcomeTo, setAddingSubOutcomeTo] = useState<number | null>(null); // outcome_id
  const [newSubOutcomeForm, setNewSubOutcomeForm] = useState({ code: '', text: '' });

  // İşlem mesajı
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Drag & Drop state
  const [dragTopicId, setDragTopicId] = useState<number | null>(null);
  const [dragOverTopicId, setDragOverTopicId] = useState<number | null>(null);

  /* ── Fetch ── */
  const fetchSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await curriculumApi.listSubjects(examTypeFilter || undefined);
      setSubjects(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [examTypeFilter]);

  const fetchSubjectDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const data = await curriculumApi.getSubject(id);
      setSelectedSubject(data);
      // Tüm konuları aç
      const topicIds = new Set((data.topics || []).map((t: TopicItem) => t.id));
      setOpenTopics(topicIds);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Detay yüklenemedi', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubjects(); }, [fetchSubjects]);

  /* ── Toast ── */
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  /* ── Ders Oluştur ── */
  const handleCreateSubject = async () => {
    if (!newSubjectForm.code || !newSubjectForm.name) return;
    try {
      await curriculumApi.createSubject(newSubjectForm);
      showToast('Ders başarıyla oluşturuldu');
      setShowNewSubject(false);
      setNewSubjectForm({ code: '', name: '', display_name: '', exam_type_filter: 'ALL' });
      fetchSubjects();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Ders oluşturulamadı', 'error');
    }
  };

  /* ── Ders Sil ── */
  const handleDeleteSubject = async (id: number, name: string) => {
    if (!confirm(`"${name}" dersi ve tüm kazanımları silinecek. Devam?`)) return;
    try {
      await curriculumApi.deleteSubject(id);
      showToast('Ders silindi');
      if (selectedSubject?.id === id) setSelectedSubject(null);
      fetchSubjects();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Silinemedi', 'error');
    }
  };

  /* ── Konu CRUD ── */
  const handleAddTopic = async () => {
    if (!selectedSubject || !newTopicForm.name) return;
    try {
      // code boşsa backend otomatik atayacak
      await curriculumApi.createTopic(selectedSubject.id, {
        code: newTopicForm.code || undefined,
        name: newTopicForm.name,
      });
      showToast('Konu eklendi');
      setAddingTopicTo(null);
      setNewTopicForm({ code: '', name: '' });
      fetchSubjectDetail(selectedSubject.id);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Konu eklenemedi', 'error');
    }
  };

  const handleUpdateTopic = async () => {
    if (!selectedSubject || !editingTopic) return;
    try {
      await curriculumApi.updateTopic(selectedSubject.id, editingTopic.id, {
        code: editingTopic.code,
        name: editingTopic.name,
      });
      showToast('Konu güncellendi');
      setEditingTopic(null);
      fetchSubjectDetail(selectedSubject.id);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Güncellenemedi', 'error');
    }
  };

  const handleDeleteTopic = async (topicId: number) => {
    if (!selectedSubject) return;
    if (!confirm('Bu konu ve tüm kazanımları silinecek. Devam?')) return;
    try {
      await curriculumApi.deleteTopic(selectedSubject.id, topicId);
      showToast('Konu silindi');
      fetchSubjectDetail(selectedSubject.id);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Silinemedi', 'error');
    }
  };

  /* ── Kazanım CRUD ── */
  const handleAddOutcome = async (topicId: number) => {
    if (!selectedSubject || !newOutcomeForm.text) return;
    try {
      // code boşsa backend otomatik atayacak
      await curriculumApi.createOutcome(selectedSubject.id, topicId, {
        code: newOutcomeForm.code || undefined,
        text: newOutcomeForm.text,
      });
      showToast('Kazanım eklendi');
      setAddingOutcomeTo(null);
      setNewOutcomeForm({ code: '', text: '' });
      fetchSubjectDetail(selectedSubject.id);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Kazanım eklenemedi', 'error');
    }
  };

  const handleUpdateOutcome = async () => {
    if (!selectedSubject || !editingOutcome) return;
    try {
      await curriculumApi.updateOutcome(
        selectedSubject.id, editingOutcome.topicId, editingOutcome.id,
        { code: editingOutcome.code, text: editingOutcome.text },
      );
      showToast('Kazanım güncellendi');
      setEditingOutcome(null);
      fetchSubjectDetail(selectedSubject.id);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Güncellenemedi', 'error');
    }
  };

  const handleDeleteOutcome = async (topicId: number, outcomeId: number) => {
    if (!selectedSubject) return;
    if (!confirm('Bu kazanım ve alt kazanımları silinecek. Devam?')) return;
    try {
      await curriculumApi.deleteOutcome(selectedSubject.id, topicId, outcomeId);
      showToast('Kazanım silindi');
      fetchSubjectDetail(selectedSubject.id);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Silinemedi', 'error');
    }
  };

  /* ── Alt Kazanım CRUD ── */
  const handleAddSubOutcome = async (topicId: number, outcomeId: number) => {
    if (!selectedSubject || !newSubOutcomeForm.text) return;
    try {
      // code boşsa backend otomatik atayacak
      await curriculumApi.createSubOutcome(selectedSubject.id, topicId, outcomeId, {
        code: newSubOutcomeForm.code || undefined,
        text: newSubOutcomeForm.text,
      });
      showToast('Alt kazanım eklendi');
      setAddingSubOutcomeTo(null);
      setNewSubOutcomeForm({ code: '', text: '' });
      fetchSubjectDetail(selectedSubject.id);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Alt kazanım eklenemedi', 'error');
    }
  };

  const handleUpdateSubOutcome = async () => {
    if (!selectedSubject || !editingSubOutcome) return;
    try {
      await curriculumApi.updateSubOutcome(
        selectedSubject.id, editingSubOutcome.topicId,
        editingSubOutcome.outcomeId, editingSubOutcome.id,
        { code: editingSubOutcome.code, text: editingSubOutcome.text },
      );
      showToast('Alt kazanım güncellendi');
      setEditingSubOutcome(null);
      fetchSubjectDetail(selectedSubject.id);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Güncellenemedi', 'error');
    }
  };

  const handleDeleteSubOutcome = async (topicId: number, outcomeId: number, subId: number) => {
    if (!selectedSubject) return;
    if (!confirm('Bu alt kazanım silinecek. Devam?')) return;
    try {
      await curriculumApi.deleteSubOutcome(selectedSubject.id, topicId, outcomeId, subId);
      showToast('Alt kazanım silindi');
      fetchSubjectDetail(selectedSubject.id);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Silinemedi', 'error');
    }
  };

  /* ── Toplu İçe Aktarım (metin) ── */
  const handleBulkTextImport = async () => {
    if (!selectedSubject || !bulkText.trim()) return;
    setBulkLoading(true);
    try {
      const result = await curriculumApi.bulkTextImport({
        subject_id: selectedSubject.id,
        text: bulkText,
      });
      setBulkResult(result);
      showToast(result.message);
      fetchSubjectDetail(selectedSubject.id);
      fetchSubjects();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'İçe aktarım hatası', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  /* ── Toggle ── */
  const toggleTopic = (id: number) => {
    setOpenTopics(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleOutcome = (id: number) => {
    setOpenOutcomes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!selectedSubject?.topics) return;
    setOpenTopics(new Set(selectedSubject.topics.map(t => t.id)));
    const allOutcomeIds = selectedSubject.topics.flatMap(t =>
      (t.outcomes || []).map(o => o.id)
    );
    setOpenOutcomes(new Set(allOutcomeIds));
  };

  const collapseAll = () => {
    setOpenTopics(new Set());
    setOpenOutcomes(new Set());
  };

  /* ── Drag & Drop — Konu Sıralama ── */
  const handleDragStart = (topicId: number) => {
    setDragTopicId(topicId);
  };

  const handleDragOver = (e: React.DragEvent, topicId: number) => {
    e.preventDefault();
    if (topicId !== dragTopicId) {
      setDragOverTopicId(topicId);
    }
  };

  const handleDragLeave = () => {
    setDragOverTopicId(null);
  };

  const handleDrop = async (targetTopicId: number) => {
    if (!selectedSubject || !dragTopicId || dragTopicId === targetTopicId) {
      setDragTopicId(null);
      setDragOverTopicId(null);
      return;
    }

    const topics = [...(selectedSubject.topics || [])];
    const fromIdx = topics.findIndex(t => t.id === dragTopicId);
    const toIdx = topics.findIndex(t => t.id === targetTopicId);
    if (fromIdx === -1 || toIdx === -1) {
      setDragTopicId(null);
      setDragOverTopicId(null);
      return;
    }

    // Sırayı değiştir
    const [moved] = topics.splice(fromIdx, 1);
    topics.splice(toIdx, 0, moved);

    // Optimistic UI update
    setSelectedSubject(prev => prev ? { ...prev, topics } : prev);
    setDragTopicId(null);
    setDragOverTopicId(null);

    // Backend'e gönder
    try {
      const newTopicIds = topics.map(t => t.id);
      const updated = await curriculumApi.reorderTopics(selectedSubject.id, newTopicIds);
      setSelectedSubject(updated);
      showToast('Konu sırası güncellendi');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Sıralama hatası', 'error');
      // Hata olursa eski veriyi yeniden yükle
      fetchSubjectDetail(selectedSubject.id);
    }
  };

  const handleDragEnd = () => {
    setDragTopicId(null);
    setDragOverTopicId(null);
  };

  /* ═══════════════════════════════════════════════════════════════════════════ */
  /*  RENDER                                                                    */
  /* ═══════════════════════════════════════════════════════════════════════════ */

  return (
    <div className={styles.container}>
      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${styles[toast.type]}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>
            <span className={styles.titleIcon}>📚</span>
            Kazanım Yönetimi
          </h1>
          <p className={styles.subtitle}>
            Ders, Konu, Kazanım ve Alt Kazanım tanımlarını yönetin
          </p>
        </div>
        <div className={styles.headerActions}>
          <select
            className={styles.filterSelect}
            value={examTypeFilter}
            onChange={e => setExamTypeFilter(e.target.value)}
          >
            {EXAM_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className={styles.btnPrimary} onClick={() => setShowNewSubject(true)}>
            ➕ Yeni Ders
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        {/* SOL PANEL — Ders Listesi */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2>Dersler</h2>
          </div>
          {loading ? (
            <div className={styles.loading}>Yükleniyor...</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : subjects.length === 0 ? (
            <div className={styles.empty}>Henüz ders tanımlanmamış</div>
          ) : (
            <div className={styles.subjectList}>
              {subjects.map(s => (
                <div
                  key={s.id}
                  className={`${styles.subjectCard} ${selectedSubject?.id === s.id ? styles.active : ''}`}
                  onClick={() => fetchSubjectDetail(s.id)}
                >
                  <div className={styles.subjectCardHeader}>
                    <span className={styles.subjectCode}>{s.code}</span>
                    <button
                      className={styles.btnDanger}
                      onClick={e => { e.stopPropagation(); handleDeleteSubject(s.id, s.name); }}
                      title="Sil"
                    >🗑</button>
                  </div>
                  <div className={styles.subjectName}>{s.display_name || s.name}</div>
                  <div className={styles.subjectMeta}>
                    <span className={styles.badge}>{s.topic_count} konu</span>
                    <span className={styles.badge}>{s.outcome_count} kazanım</span>
                  </div>
                  {(s.linked_sections?.length ?? 0) > 0 && (
                    <div className={styles.linkedSections}>
                      🔗 {s.linked_sections?.map(ls => ls.section_name).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SAĞ PANEL — Detay & Ağaç Görünümü */}
        <div className={styles.mainPanel}>
          {!selectedSubject ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📖</div>
              <h2>Bir ders seçin</h2>
              <p>Sol panelden bir ders seçerek kazanım ağacını görüntüleyebilirsiniz.</p>
            </div>
          ) : detailLoading ? (
            <div className={styles.loading}>Kazanımlar yükleniyor...</div>
          ) : (
            <>
              {/* Ders Başlığı */}
              <div className={styles.detailHeader}>
                <div className={styles.detailHeaderLeft}>
                  <h2 className={styles.detailTitle}>
                    {selectedSubject.display_name || selectedSubject.name}
                  </h2>
                  <div className={styles.detailStats}>
                    <span className={styles.statBadge}>📂 {selectedSubject.topic_count} konu</span>
                    <span className={styles.statBadge}>🎯 {selectedSubject.total_outcomes} kazanım</span>
                    <span className={styles.statBadge}>📝 {selectedSubject.total_sub_outcomes} alt kazanım</span>
                  </div>
                </div>
                <div className={styles.detailActions}>
                  <button className={styles.btnOutline} onClick={expandAll} title="Tümünü Aç">
                    🔽 Aç
                  </button>
                  <button className={styles.btnOutline} onClick={collapseAll} title="Tümünü Kapat">
                    🔼 Kapat
                  </button>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => { setShowBulkModal(true); setBulkText(''); setBulkResult(null); }}
                  >
                    📋 Toplu Ekle
                  </button>
                  <button
                    className={styles.btnOutline}
                    onClick={() => setAddingTopicTo(selectedSubject.id)}
                  >
                    ➕ Konu Ekle
                  </button>
                </div>
              </div>

              {/* Yeni Konu Ekleme Formu */}
              {addingTopicTo === selectedSubject.id && (
                <div className={styles.inlineForm}>
                  <input
                    className={styles.formInput}
                    placeholder="Otomatik numara (veya özel kod)"
                    value={newTopicForm.code}
                    onChange={e => setNewTopicForm(p => ({ ...p, code: e.target.value }))}
                  />
                  <input
                    className={styles.formInput}
                    placeholder="Konu adı"
                    value={newTopicForm.name}
                    onChange={e => setNewTopicForm(p => ({ ...p, name: e.target.value }))}
                    style={{ flex: 2 }}
                  />
                  <button className={styles.btnPrimary} onClick={handleAddTopic}>Ekle</button>
                  <button className={styles.btnOutline} onClick={() => setAddingTopicTo(null)}>İptal</button>
                </div>
              )}

              {/* Konu → Kazanım → Alt Kazanım Ağacı */}
              <div className={styles.tree}>
                {(selectedSubject.topics || []).map(topic => (
                  <div
                    key={topic.id}
                    className={`${styles.topicNode}${dragTopicId === topic.id ? ` ${styles.dragging}` : ''}${dragOverTopicId === topic.id ? ` ${styles.dragOver}` : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(topic.id)}
                    onDragOver={(e) => handleDragOver(e, topic.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={() => handleDrop(topic.id)}
                    onDragEnd={handleDragEnd}
                  >
                    {/* Konu Başlığı */}
                    <div className={styles.topicHeader} onClick={() => toggleTopic(topic.id)}>
                      <span
                        className={styles.dragHandle}
                        onMouseDown={e => e.stopPropagation()}
                        title="Sürükle"
                      >⠿</span>
                      <span className={styles.toggleIcon}>
                        {openTopics.has(topic.id) ? '▼' : '▶'}
                      </span>
                      {editingTopic?.id === topic.id ? (
                        <div className={styles.inlineEdit} onClick={e => e.stopPropagation()}>
                          <input
                            className={styles.formInputSm}
                            value={editingTopic.code}
                            onChange={e => setEditingTopic(p => p ? { ...p, code: e.target.value } : p)}
                            placeholder="Kod"
                          />
                          <input
                            className={styles.formInputSm}
                            value={editingTopic.name}
                            onChange={e => setEditingTopic(p => p ? { ...p, name: e.target.value } : p)}
                            placeholder="Ad"
                            style={{ flex: 2 }}
                          />
                          <button className={styles.btnSmPrimary} onClick={handleUpdateTopic}>💾</button>
                          <button className={styles.btnSmOutline} onClick={() => setEditingTopic(null)}>✕</button>
                        </div>
                      ) : (
                        <>
                          <span className={styles.topicCode}>{topic.code}</span>
                          <span className={styles.topicName}>{topic.name}</span>
                          <span className={styles.topicCount}>({topic.outcome_count || topic.outcomes?.length || 0} kazanım)</span>
                          <div className={styles.nodeActions} onClick={e => e.stopPropagation()}>
                            <button
                              className={styles.btnSmOutline}
                              onClick={() => setEditingTopic({ id: topic.id, code: topic.code || '', name: topic.name })}
                              title="Düzenle"
                            >✏️</button>
                            <button
                              className={styles.btnSmOutline}
                              onClick={() => { setAddingOutcomeTo(topic.id); setNewOutcomeForm({ code: '', text: '' }); }}
                              title="Kazanım Ekle"
                            >➕</button>
                            <button
                              className={styles.btnSmDanger}
                              onClick={() => handleDeleteTopic(topic.id)}
                              title="Sil"
                            >🗑</button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Konu Açıksa → Kazanımlar */}
                    {openTopics.has(topic.id) && (
                      <div className={styles.outcomeList}>
                        {/* Yeni Kazanım Ekleme */}
                        {addingOutcomeTo === topic.id && (
                          <div className={styles.inlineForm}>
                            <input
                              className={styles.formInput}
                              placeholder="Otomatik numara (veya özel kod)"
                              value={newOutcomeForm.code}
                              onChange={e => setNewOutcomeForm(p => ({ ...p, code: e.target.value }))}
                            />
                            <input
                              className={styles.formInput}
                              placeholder="Kazanım metni"
                              value={newOutcomeForm.text}
                              onChange={e => setNewOutcomeForm(p => ({ ...p, text: e.target.value }))}
                              style={{ flex: 3 }}
                            />
                            <button className={styles.btnPrimary} onClick={() => handleAddOutcome(topic.id)}>Ekle</button>
                            <button className={styles.btnOutline} onClick={() => setAddingOutcomeTo(null)}>İptal</button>
                          </div>
                        )}

                        {(topic.outcomes || []).map(outcome => (
                          <div key={outcome.id} className={styles.outcomeNode}>
                            {/* Kazanım Başlığı */}
                            <div className={styles.outcomeHeader} onClick={() => toggleOutcome(outcome.id)}>
                              <span className={styles.toggleIconSm}>
                                {openOutcomes.has(outcome.id) ? '▾' : '▸'}
                              </span>
                              {editingOutcome?.id === outcome.id ? (
                                <div className={styles.inlineEdit} onClick={e => e.stopPropagation()}>
                                  <input
                                    className={styles.formInputSm}
                                    value={editingOutcome.code}
                                    onChange={e => setEditingOutcome(p => p ? { ...p, code: e.target.value } : p)}
                                    placeholder="Kod"
                                  />
                                  <input
                                    className={styles.formInputSm}
                                    value={editingOutcome.text}
                                    onChange={e => setEditingOutcome(p => p ? { ...p, text: e.target.value } : p)}
                                    placeholder="Metin"
                                    style={{ flex: 3 }}
                                  />
                                  <button className={styles.btnSmPrimary} onClick={handleUpdateOutcome}>💾</button>
                                  <button className={styles.btnSmOutline} onClick={() => setEditingOutcome(null)}>✕</button>
                                </div>
                              ) : (
                                <>
                                  <span className={styles.outcomeCode}>{outcome.code}</span>
                                  <span className={styles.outcomeText}>{outcome.text}</span>
                                  <span className={styles.subCount}>
                                    ({outcome.sub_outcome_count || outcome.sub_outcomes?.length || 0})
                                  </span>
                                  <div className={styles.nodeActions} onClick={e => e.stopPropagation()}>
                                    <button
                                      className={styles.btnSmOutline}
                                      onClick={() => setEditingOutcome({
                                        id: outcome.id, topicId: topic.id,
                                        code: outcome.code, text: outcome.text,
                                      })}
                                      title="Düzenle"
                                    >✏️</button>
                                    <button
                                      className={styles.btnSmOutline}
                                      onClick={() => { setAddingSubOutcomeTo(outcome.id); setNewSubOutcomeForm({ code: '', text: '' }); }}
                                      title="Alt Kazanım Ekle"
                                    >➕</button>
                                    <button
                                      className={styles.btnSmDanger}
                                      onClick={() => handleDeleteOutcome(topic.id, outcome.id)}
                                      title="Sil"
                                    >🗑</button>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Kazanım Açıksa → Alt Kazanımlar */}
                            {openOutcomes.has(outcome.id) && (
                              <div className={styles.subOutcomeList}>
                                {/* Yeni Alt Kazanım */}
                                {addingSubOutcomeTo === outcome.id && (
                                  <div className={styles.inlineForm}>
                                    <input
                                      className={styles.formInput}
                                      placeholder="Otomatik numara (veya özel kod)"
                                      value={newSubOutcomeForm.code}
                                      onChange={e => setNewSubOutcomeForm(p => ({ ...p, code: e.target.value }))}
                                    />
                                    <input
                                      className={styles.formInput}
                                      placeholder="Alt kazanım metni"
                                      value={newSubOutcomeForm.text}
                                      onChange={e => setNewSubOutcomeForm(p => ({ ...p, text: e.target.value }))}
                                      style={{ flex: 3 }}
                                    />
                                    <button className={styles.btnPrimary} onClick={() => handleAddSubOutcome(topic.id, outcome.id)}>Ekle</button>
                                    <button className={styles.btnOutline} onClick={() => setAddingSubOutcomeTo(null)}>İptal</button>
                                  </div>
                                )}

                                {(outcome.sub_outcomes || []).map(sub => (
                                  <div key={sub.id} className={styles.subOutcomeNode}>
                                    {editingSubOutcome?.id === sub.id ? (
                                      <div className={styles.inlineEdit}>
                                        <input
                                          className={styles.formInputSm}
                                          value={editingSubOutcome.code}
                                          onChange={e => setEditingSubOutcome(p => p ? { ...p, code: e.target.value } : p)}
                                          placeholder="Kod"
                                        />
                                        <input
                                          className={styles.formInputSm}
                                          value={editingSubOutcome.text}
                                          onChange={e => setEditingSubOutcome(p => p ? { ...p, text: e.target.value } : p)}
                                          placeholder="Metin"
                                          style={{ flex: 3 }}
                                        />
                                        <button className={styles.btnSmPrimary} onClick={handleUpdateSubOutcome}>💾</button>
                                        <button className={styles.btnSmOutline} onClick={() => setEditingSubOutcome(null)}>✕</button>
                                      </div>
                                    ) : (
                                      <>
                                        <span className={styles.subOutcomeCode}>{sub.code}</span>
                                        <span className={styles.subOutcomeText}>{sub.text}</span>
                                        <div className={styles.nodeActions}>
                                          <button
                                            className={styles.btnSmOutline}
                                            onClick={() => setEditingSubOutcome({
                                              id: sub.id, outcomeId: outcome.id, topicId: topic.id,
                                              code: sub.code, text: sub.text,
                                            })}
                                            title="Düzenle"
                                          >✏️</button>
                                          <button
                                            className={styles.btnSmDanger}
                                            onClick={() => handleDeleteSubOutcome(topic.id, outcome.id, sub.id)}
                                            title="Sil"
                                          >🗑</button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                ))}

                                {(!outcome.sub_outcomes || outcome.sub_outcomes.length === 0) && (
                                  <div className={styles.emptySubOutcome}>
                                    Alt kazanım bulunmuyor
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {(!topic.outcomes || topic.outcomes.length === 0) && (
                          <div className={styles.emptyOutcome}>
                            Kazanım bulunmuyor
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {(!selectedSubject.topics || selectedSubject.topics.length === 0) && (
                  <div className={styles.emptyTree}>
                    <p>Bu derste henüz konu ve kazanım tanımlanmamış.</p>
                    <p>📋 <strong>Toplu Ekle</strong> butonunu kullanarak kopyala-yapıştır ile hızlıca kazanım girebilirsiniz.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Yeni Ders Modal ── */}
      {showNewSubject && (
        <div className={styles.modalOverlay} onClick={() => setShowNewSubject(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Yeni Ders Oluştur</h3>
            <div className={styles.formGroup}>
              <label>Ders Kodu *</label>
              <input
                className={styles.formInput}
                placeholder="Ör: MAT_TYT, FIZ_AYT"
                value={newSubjectForm.code}
                onChange={e => setNewSubjectForm(p => ({ ...p, code: e.target.value }))}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Ders Adı *</label>
              <input
                className={styles.formInput}
                placeholder="Ör: Matematik"
                value={newSubjectForm.name}
                onChange={e => setNewSubjectForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Görünen Ad</label>
              <input
                className={styles.formInput}
                placeholder="Ör: Matematik (TYT)"
                value={newSubjectForm.display_name}
                onChange={e => setNewSubjectForm(p => ({ ...p, display_name: e.target.value }))}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Sınav Türü</label>
              <select
                className={styles.formInput}
                value={newSubjectForm.exam_type_filter}
                onChange={e => setNewSubjectForm(p => ({ ...p, exam_type_filter: e.target.value }))}
              >
                <option value="ALL">Tüm Sınav Türleri</option>
                <option value="YKS_TYT">YKS – TYT</option>
                <option value="YKS_AYT">YKS – AYT</option>
                <option value="LGS">LGS</option>
              </select>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnOutline} onClick={() => setShowNewSubject(false)}>İptal</button>
              <button className={styles.btnPrimary} onClick={handleCreateSubject}>Oluştur</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toplu Ekleme Modal ── */}
      {showBulkModal && selectedSubject && (
        <div className={styles.modalOverlay} onClick={() => setShowBulkModal(false)}>
          <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>
              📋 Toplu Kazanım Ekle — {selectedSubject.display_name || selectedSubject.name}
            </h3>
            <p className={styles.modalHint}>
              Aşağıdaki formata uygun metni yapıştırın. Sistem otomatik olarak konu, kazanım ve alt kazanımları tanıyacaktır.
            </p>
            <div className={styles.formatExample}>
              <strong>Format:</strong><br />
              <code>9.1. KONU ADI</code> → Konu<br />
              <code>9.1.1. Kazanım metni...</code> → Kazanım<br />
              <code>9.1.1.1 Alt kazanım metni...</code> → Alt Kazanım
            </div>
            <textarea
              className={styles.bulkTextarea}
              placeholder="Kazanım metnini buraya yapıştırın..."
              rows={15}
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
            />
            {bulkResult && (
              <div className={styles.bulkResult}>
                ✅ {bulkResult.message}
                <div className={styles.bulkStats}>
                  📂 {bulkResult.stats.topics} konu &nbsp;|&nbsp;
                  🎯 {bulkResult.stats.outcomes} kazanım &nbsp;|&nbsp;
                  📝 {bulkResult.stats.sub_outcomes} alt kazanım
                </div>
              </div>
            )}
            <div className={styles.modalFooter}>
              <button className={styles.btnOutline} onClick={() => setShowBulkModal(false)}>
                {bulkResult ? 'Kapat' : 'İptal'}
              </button>
              {!bulkResult && (
                <button
                  className={styles.btnPrimary}
                  onClick={handleBulkTextImport}
                  disabled={bulkLoading || !bulkText.trim()}
                >
                  {bulkLoading ? '⏳ Yükleniyor...' : '📥 İçe Aktar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
