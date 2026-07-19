'use client';

import { Student360ActionId } from '@/lib/coach-api';
import Student360Icon, {
  type Student360IconName,
} from '@/components/coach/Student360Icon';

export interface QuickActionBarProps {
  onAction: (action: Student360ActionId) => void;
  onMesaj?: () => void;
}

const ACTIONS: {
  id: Student360ActionId;
  label: string;
  shortLabel: string;
  icon: Student360IconName;
  variant?: 'primary' | 'danger';
}[] = [
  {
    id: 'gorusme-ekle',
    label: 'Görüşme ekle',
    shortLabel: 'Görüşme',
    icon: 'meeting',
    variant: 'primary',
  },
  { id: 'program', label: 'Program oluştur', shortLabel: 'Program', icon: 'calendar' },
  { id: 'odev-ver', label: 'Ödev ver', shortLabel: 'Ödev', icon: 'homework' },
  { id: 'risk', label: 'Risk bildir', shortLabel: 'Risk', icon: 'risk', variant: 'danger' },
];

export default function QuickActionBar({ onAction, onMesaj }: QuickActionBarProps) {
  return (
    <nav className="coach-quick-action-bar student360-quick-bar" aria-label="Hızlı işlemler">
      <div className="s360-quick-heading">
        <span>Hızlı işlemler</span>
        <small>Sık kullanılan aksiyonlar</small>
      </div>
      <div className="student360-quick-bar-inner">
        {onMesaj && (
          <button type="button" className="coach-qa-btn" onClick={onMesaj} title="WhatsApp mesajları">
            <span className="coach-qa-icon">
              <Student360Icon name="message" size={19} />
            </span>
            <span className="coach-qa-label">Mesaj</span>
          </button>
        )}
        {ACTIONS.map((action) => {
          const className = [
            'coach-qa-btn',
            action.variant === 'primary' ? 'primary' : '',
            action.variant === 'danger' ? 'danger' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={action.id}
              type="button"
              className={className}
              onClick={() => onAction(action.id)}
              title={action.label}
            >
              <span className="coach-qa-icon">
                <Student360Icon name={action.icon} size={19} />
              </span>
              <span className="coach-qa-label">
                <span className="s360-qa-label-full">{action.label}</span>
                <span className="s360-qa-label-short">{action.shortLabel}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
