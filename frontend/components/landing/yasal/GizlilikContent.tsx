import YasalMetinContent from '@/components/landing/yasal/YasalMetinContent';
import { GIZLILIK_META, GIZLILIK_NAV, GIZLILIK_SECTIONS } from '@/lib/gizlilik-content';

export default function GizlilikContent() {
  return (
    <YasalMetinContent
      meta={GIZLILIK_META}
      nav={GIZLILIK_NAV}
      sections={GIZLILIK_SECTIONS}
    />
  );
}
