'use client';

import WhatsAppChatButton from '@/components/communication/WhatsAppChatButton';

interface CoachStudentQuickActionsProps {
  veliTelefon?: string | null;
  veliId?: number;
  ogrenciId?: number;
  ogrenciAd?: string;
  onGorusme: () => void;
  onRisk: () => void;
  compact?: boolean;
}

export default function CoachStudentQuickActions({
  veliTelefon,
  veliId,
  ogrenciId,
  ogrenciAd,
  onGorusme,
  onRisk,
  compact = false,
}: CoachStudentQuickActionsProps) {
  const tel = veliTelefon?.replace(/\s/g, '');
  const telHref = tel ? `tel:${tel}` : null;

  return (
    <div
      className={`coach-student-actions${compact ? ' is-compact' : ''}`}
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {telHref ? (
        <a
        href={telHref}
        className="coach-student-action-btn"
        title="Veli ara"
        onClick={(e) => e.stopPropagation()}
      >
          📞
          {!compact && <span>Veli</span>}
        </a>
      ) : (
        <button type="button" className="coach-student-action-btn is-disabled" disabled title="Veli tel yok">
          📞
          {!compact && <span>Veli</span>}
        </button>
      )}
      {veliTelefon && ogrenciId ? (
        <WhatsAppChatButton
          phone={veliTelefon}
          ogrenciId={ogrenciId}
          veliId={veliId}
          contactLabel={ogrenciAd ? `${ogrenciAd} velisi` : 'Veli'}
          className="coach-student-action-btn coach-student-action-btn--whatsapp"
          title="Veliye WhatsApp mesajı — uygulama içinde açılır"
          size={16}
          variant={compact ? 'icon' : 'pill'}
          label="Mesaj"
        />
      ) : (
        <button
          type="button"
          className="coach-student-action-btn is-disabled"
          disabled
          title="Veli telefonu yok — öğrenci kartından Mesajlar sekmesini kullanın"
        >
          💬
          {!compact && <span>Mesaj</span>}
        </button>
      )}
      <button
        type="button"
        className="coach-student-action-btn is-primary"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onGorusme();
        }}
        title="Görüşme ekle"
      >
        💬
        {!compact && <span>Görüşme</span>}
      </button>
      <button
        type="button"
        className="coach-student-action-btn is-danger"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRisk();
        }}
        title="Risk bildir"
      >
        ⚠️
        {!compact && <span>Risk</span>}
      </button>
    </div>
  );
}
