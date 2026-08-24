import { EmptyState, PageShell } from './ui';
import { IconWand } from './ui/icons';

type Props = {
  tabLabel: string;
  groupLabel: string;
  /** Placeholder'ın nedenini kullanıcıya açıklayan ek not (opsiyonel). */
  reason?: string;
};

export default function AkademikTabContent({ tabLabel, groupLabel, reason }: Props) {
  return (
    <PageShell>
      <div className="ak-panel">
        <EmptyState
          icon={<IconWand size={22} />}
          title={`${tabLabel} yakında`}
          description={
            reason ??
            `Bu ekran ${groupLabel} bölümünde hazırlanıyor. Hazır olduğunda menüde görünecek.`
          }
        />
      </div>
    </PageShell>
  );
}
