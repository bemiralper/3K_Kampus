'use client';

type IletisimMesaji = {
  id: number;
  ad_soyad: string;
  telefon: string;
  mesaj: string;
  okundu: boolean;
  created_at: string;
};

type MesajlarPanelProps = {
  mesajlar: IletisimMesaji[];
  onToggleOkundu: (id: number, okundu: boolean) => Promise<void>;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MesajlarPanel({ mesajlar, onToggleOkundu }: MesajlarPanelProps) {
  const unread = mesajlar.filter(m => !m.okundu).length;

  return (
    <div className="wam-panel">
      <div className="wam-panel-header">
        <div>
          <h3>Gelen Mesajlar</h3>
          <p>İletişim formundan gelen talepler · {unread > 0 ? `${unread} okunmamış` : 'Tümü okundu'}</p>
        </div>
      </div>
      <div className="wam-panel-body wam-mesajlar-body">
        {mesajlar.length === 0 ? (
          <div className="wam-empty">Henüz mesaj yok.</div>
        ) : (
          <div className="wam-mesajlar-list">
            {mesajlar.map(m => (
              <article
                key={m.id}
                className={`wam-mesaj-card ${m.okundu ? 'is-read' : 'is-unread'}`}
              >
                <div className="wam-mesaj-card-head">
                  <div className="wam-mesaj-avatar" aria-hidden>
                    {m.ad_soyad.charAt(0).toUpperCase()}
                  </div>
                  <div className="wam-mesaj-meta">
                    <strong className="wam-mesaj-name">{m.ad_soyad}</strong>
                    <a href={`tel:${m.telefon.replace(/\s/g, '')}`} className="wam-mesaj-phone">
                      {m.telefon}
                    </a>
                    <time className="wam-mesaj-date" dateTime={m.created_at}>
                      {formatDate(m.created_at)}
                    </time>
                  </div>
                  {!m.okundu && <span className="wam-mesaj-badge">Yeni</span>}
                </div>

                <div className="wam-mesaj-text">{m.mesaj}</div>

                <div className="wam-mesaj-actions">
                  <button
                    type="button"
                    className={`wam-btn wam-btn-sm ${m.okundu ? 'wam-btn-ghost' : 'wam-btn-secondary'}`}
                    onClick={() => onToggleOkundu(m.id, !m.okundu)}
                  >
                    {m.okundu ? 'Okunmadı İşaretle' : 'Okundu İşaretle'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
