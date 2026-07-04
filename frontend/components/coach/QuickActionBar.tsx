'use client';

import { Student360ActionId } from '@/lib/coach-api';

export interface QuickActionBarProps {
  onAction: (action: Student360ActionId) => void;
}

const ACTIONS: {
  id: Student360ActionId;
  label: string;
  icon: string;
  variant?: 'primary' | 'danger';
}[] = [
  { id: 'gorusme-ekle', label: 'Görüşme', icon: '💬', variant: 'primary' },
  { id: 'program', label: 'Program', icon: '📅' },
  { id: 'odev-ver', label: 'Ödev', icon: '📝' },
  { id: 'risk', label: 'Risk', icon: '⚠️', variant: 'danger' },
];

export default function QuickActionBar({ onAction }: QuickActionBarProps) {
  return (
    <nav className="coach-quick-action-bar student360-quick-bar" aria-label="Hızlı işlemler">
      <div className="student360-quick-bar-inner">
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
            >
              <span className="coach-qa-icon">{action.icon}</span>
              <span className="coach-qa-label">{action.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
