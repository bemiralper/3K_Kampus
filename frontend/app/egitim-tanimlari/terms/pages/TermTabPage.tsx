/**
 * Term Tab Page Component
 * Eğitim Dönemleri sayfası
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Term, TermFormData, EgitimYili } from '../types';
import { getActiveYear, getTerms, createTerm, updateTerm } from '../services/term.service';
import { useKurum } from '@/lib/contexts/KurumContext';
import TermTable from '../components/TermTable';
import TermDrawerForm from '../components/TermDrawerForm';

const styles = {
  container: {
    padding: '0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  },
  yearBadge: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  addBtn: {
    padding: '10px 20px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  tableCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
  },
  noYearWarning: {
    backgroundColor: '#fef3c7',
    border: '1px solid #fcd34d',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    color: '#92400e',
    fontSize: '14px',
  },
  errorState: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center' as const,
    color: '#dc2626',
  },
};

export default function TermTabPage() {
  const { activeKurum, activeSube, activeEgitimYili, loading: contextLoading } = useKurum();
  const [terms, setTerms] = useState<Term[]>([]);
  const [activeYear, setActiveYear] = useState<EgitimYili | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);

  const fetchData = useCallback(async () => {
    if (contextLoading) return;

    setLoading(true);
    setError(null);

    if (!activeKurum || !activeSube) {
      setTerms([]);
      setActiveYear(null);
      setError('Kurum ve şube seçimi gerekli. Üst menüden kurum/şube seçin veya önce şube tanımlayın.');
      setLoading(false);
      return;
    }
    
    try {
      const year =
        activeEgitimYili
          ? {
              id: activeEgitimYili.id,
              baslangic_yil: activeEgitimYili.baslangic_yil,
              bitis_yil: activeEgitimYili.bitis_yil,
              aktif_mi: activeEgitimYili.aktif_mi,
              display: `${activeEgitimYili.baslangic_yil}-${activeEgitimYili.bitis_yil}`,
            }
          : await getActiveYear();
      setActiveYear(year);
      
      if (year) {
        const termsList = await getTerms();
        setTerms(termsList);
      } else {
        setTerms([]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Veriler yüklenemedi';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [contextLoading, activeKurum, activeSube, activeEgitimYili]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddClick = () => {
    setEditingTerm(null);
    setIsDrawerOpen(true);
  };

  const handleEditClick = (term: Term) => {
    setEditingTerm(term);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setEditingTerm(null);
  };

  const handleSubmit = async (formData: TermFormData) => {
    if (editingTerm) {
      await updateTerm(editingTerm.id, formData);
    } else {
      await createTerm(formData);
    }
    await fetchData();
  };

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorState}>
          <p>Hata: {error}</p>
          <button
            onClick={fetchData}
            style={{ ...styles.addBtn, marginTop: '12px' }}
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>Eğitim Dönemleri</h2>
          {activeYear && (
            <div style={styles.yearBadge}>
              <span>📅</span>
              <span>{activeYear.display}</span>
            </div>
          )}
        </div>
        
        <button
          style={styles.addBtn}
          onClick={handleAddClick}
          disabled={!activeYear}
        >
          <span>+</span>
          <span>Yeni Dönem</span>
        </button>
      </div>

      {/* Aktif yıl yoksa uyarı */}
      {!activeYear && !loading && (
        <div style={styles.noYearWarning}>
          <span>⚠️</span>
          <span>
            Aktif eğitim yılı seçili değil. Dönem eklemek için lütfen önce eğitim yılı seçin.
          </span>
        </div>
      )}

      {/* Table */}
      <div style={styles.tableCard}>
        <TermTable
          terms={terms}
          loading={loading}
          onEdit={handleEditClick}
        />
      </div>

      {/* Drawer */}
      <TermDrawerForm
        isOpen={isDrawerOpen}
        onClose={handleDrawerClose}
        onSubmit={handleSubmit}
        editingTerm={editingTerm}
        activeYear={activeYear}
      />
    </div>
  );
}
