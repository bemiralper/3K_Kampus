'use client';

import React from 'react';
import { CoachStudent } from '@/lib/coaching-api';

interface CoachStudentsTableProps {
  students: CoachStudent[];
  loading?: boolean;
}

export default function CoachStudentsTable({ students, loading = false }: CoachStudentsTableProps) {
  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
        Yükleniyor...
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>📚</div>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>
          Henüz atanmış öğrenci yok
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            <th style={thStyle}>Öğrenci</th>
            <th style={thStyle}>Başlangıç</th>
            <th style={thStyle}>Bitiş</th>
            <th style={thStyle}>Tip</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#3b82f6',
                    }}
                  >
                    {student.student_ad.charAt(0)}{student.student_soyad.charAt(0)}
                  </div>
                  <span style={{ fontWeight: 500 }}>{student.student_full_name}</span>
                </div>
              </td>
              <td style={tdStyle}>
                {new Date(student.start_date).toLocaleDateString('tr-TR')}
              </td>
              <td style={tdStyle}>
                {student.end_date ? new Date(student.end_date).toLocaleDateString('tr-TR') : '-'}
              </td>
              <td style={tdStyle}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    backgroundColor: student.is_primary ? '#d1fae5' : '#f3f4f6',
                    color: student.is_primary ? '#059669' : '#374151',
                  }}
                >
                  {student.is_primary ? 'Ana Koç' : 'Yardımcı'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  color: '#374151',
};
