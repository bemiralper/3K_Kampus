'use client';

import WhatsAppChatButton from '@/components/communication/WhatsAppChatButton';

interface CoachStudentQuickActionsProps {
  ogrenciTelefon?: string | null;
  veliTelefon?: string | null;
  veliId?: number;
  ogrenciId?: number;
  ogrenciAd?: string;
  onGorusme: () => void;
  onRisk: () => void;
  compact?: boolean;
}

export default function CoachStudentQuickActions({
  ogrenciTelefon,
  veliTelefon,
  veliId,
  ogrenciId,
  ogrenciAd,
  onGorusme,
  onRisk,
  compact = false,
}: CoachStudentQuickActionsProps) {
  const veliTel = veliTelefon?.replace(/\s/g, '') || '';
  const ogrTel = ogrenciTelefon?.replace(/\s/g, '') || '';
  const telHref = veliTel ? `tel:${veliTel}` : ogrTel ? `tel:${ogrTel}` : null;

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
          title={veliTel ? 'Veli ara' : 'Öğrenci ara'}
          onClick={(e) => e.stopPropagation()}
        >
          📞
          {!compact && <span>{veliTel ? 'Veli' : 'Ara'}</span>}
        </a>
      ) : (
        <button type="button" className="coach-student-action-btn is-disabled" disabled title="Telefon yok">
          📞
          {!compact && <span>Ara</span>}
        </button>
      )}

      {ogrTel && ogrenciId ? (
        <WhatsAppChatButton
          phone={ogrenciTelefon!}
          ogrenciId={ogrenciId}
          contactLabel={ogrenciAd || 'Öğrenci'}
          className="coach-student-action-btn coach-student-action-btn--whatsapp coach-student-action-btn--wa-ogrenci"
          title="Öğrenciye WhatsApp — sohbet_kocluk_ogrenci"
          size={16}
          variant={compact ? 'icon' : 'pill'}
          label="Öğrenci"
        >
          {compact ? (
            <>
              <span aria-hidden="true">💬</span>
              <span className="coach-wa-chip">Ö</span>
            </>
          ) : undefined}
        </WhatsAppChatButton>
      ) : null}

      {veliTel && ogrenciId ? (
        <WhatsAppChatButton
          phone={veliTelefon!}
          ogrenciId={ogrenciId}
          veliId={veliId}
          contactLabel={ogrenciAd ? `${ogrenciAd} velisi` : 'Veli'}
          className="coach-student-action-btn coach-student-action-btn--whatsapp coach-student-action-btn--wa-veli"
          title="Veliye WhatsApp — sohbet_kocluk_veli"
          size={16}
          variant={compact ? 'icon' : 'pill'}
          label="Veli"
        >
          {compact ? (
            <>
              <span aria-hidden="true">💬</span>
              <span className="coach-wa-chip">V</span>
            </>
          ) : undefined}
        </WhatsAppChatButton>
      ) : null}

      {!ogrTel && !veliTel ? (
        <button
          type="button"
          className="coach-student-action-btn is-disabled"
          disabled
          title="Telefon yok — öğrenci kartından kontrol edin"
        >
          💬
          {!compact && <span>Mesaj</span>}
        </button>
      ) : null}

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
        🗓️
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
