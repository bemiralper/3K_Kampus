'use client';

import {
  STUDENT360_GROUPS,
  STUDENT360_PANEL_LABELS,
  groupForStudent360Tab,
  type Student360GroupId,
  type Student360TabId,
} from '@/lib/coach-api';
import Student360Icon, {
  type Student360IconName,
} from '@/components/coach/Student360Icon';

type PanelId = Exclude<Student360TabId, 'genel'>;

const GROUP_ICONS: Record<Student360GroupId, Student360IconName> = {
  ozet: 'overview',
  akademik: 'academic',
  iletisim: 'communication',
  kayit: 'record',
};

const PANEL_ICONS: Record<PanelId, Student360IconName> = {
  ozet: 'overview',
  bilgi: 'profile',
  odevler: 'homework',
  sinavlar: 'exam',
  gorusmeler: 'meeting',
  mesajlar: 'message',
  program: 'calendar',
  kutuphane: 'library',
  veli: 'family',
  belgeler: 'document',
};

interface Student360GroupNavProps {
  activeTab: PanelId;
  onTabChange: (tab: PanelId) => void;
  disabled?: boolean;
}

export default function Student360GroupNav({
  activeTab,
  onTabChange,
  disabled = false,
}: Student360GroupNavProps) {
  const activeGroup = groupForStudent360Tab(activeTab);
  const group = STUDENT360_GROUPS.find((g) => g.id === activeGroup)!;
  const showSegments = group.panels.length > 1;

  const selectGroup = (groupId: Student360GroupId) => {
    const g = STUDENT360_GROUPS.find((x) => x.id === groupId);
    if (!g) return;
    if (g.panels.includes(activeTab)) return;
    onTabChange(g.panels[0]);
  };

  return (
    <nav className="s360-nav" aria-label="Öğrenci çalışma alanı">
      <div className="s360-nav-title">Çalışma alanı</div>
      <div className="s360-nav-groups" role="tablist" aria-label="Öğrenci bölümleri">
        {STUDENT360_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={activeGroup === g.id}
            className={`s360-nav-group${activeGroup === g.id ? ' active' : ''}`}
            disabled={disabled}
            onClick={() => selectGroup(g.id)}
          >
            <span className="s360-nav-group-icon">
              <Student360Icon name={GROUP_ICONS[g.id]} size={18} />
            </span>
            <span>{g.label}</span>
            <span className="s360-nav-chevron" aria-hidden>
              ›
            </span>
          </button>
        ))}
      </div>

      {showSegments && (
        <div
          className="s360-nav-segments"
          role="tablist"
          aria-label={`${group.label} alt bölümleri`}
        >
          {group.panels.map((panelId) => (
            <button
              key={panelId}
              type="button"
              role="tab"
              aria-selected={activeTab === panelId}
              className={`s360-nav-segment${activeTab === panelId ? ' active' : ''}`}
              disabled={disabled}
              onClick={() => onTabChange(panelId)}
            >
              <Student360Icon name={PANEL_ICONS[panelId]} size={15} />
              {STUDENT360_PANEL_LABELS[panelId]}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
