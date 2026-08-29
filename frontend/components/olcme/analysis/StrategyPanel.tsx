'use client';

import Icon from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Panel, EmptyState } from '../ui/analysis';
import type { StrategyItem } from '../types';

/**
 * Backend her öneriyle birlikte bir emoji (`icon`) gönderiyor, ancak emoji
 * platforma göre farklı render ediliyor ve renk alamıyor. Öneri tipinden
 * kendi ikonumuzu türetiyoruz; backend alanı sözleşmeyi bozmamak için
 * yerinde bırakıldı.
 */
const STYLE: Record<StrategyItem['type'], { icon: IconName; bg: string; border: string; fg: string }> = {
  warning: { icon: 'alert',       bg: '#fffbeb', border: '#fde68a', fg: '#b45309' },
  success: { icon: 'checkCircle', bg: '#f0fdf4', border: '#bbf7d0', fg: '#15803d' },
  info:    { icon: 'info',        bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8' },
};

export default function StrategyPanel({ strategies }: { strategies: StrategyItem[] }) {
  if (!strategies.length) {
    return (
      <Panel title="Strateji Önerileri" icon="info">
        <EmptyState
          title="Öneri üretilemedi"
          description="Öneriler katılım ve net dağılımına bakılarak üretilir; bu sınavda yeterli veri birikmemiş."
        />
      </Panel>
    );
  }

  // Backend priority veriyor; önce en kritik öneri görünsün.
  const ordered = [...strategies].sort((a, b) => a.priority - b.priority);

  return (
    <Panel
      title="Strateji Önerileri"
      icon="info"
      subtitle="Sınav sonuçlarından türetilen, önem sırasına göre dizilmiş eylem önerileri."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ordered.map((st, i) => {
          const style = STYLE[st.type] ?? STYLE.info;
          return (
            <div
              key={i}
              style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '13px 16px', borderRadius: 12,
                background: style.bg, border: `1px solid ${style.border}`,
              }}
            >
              <span style={{ color: style.fg, display: 'flex', marginTop: 1 }}>
                <Icon name={style.icon} size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: style.fg, marginBottom: 3 }}>
                  {st.title}
                </div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                  {st.message}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
