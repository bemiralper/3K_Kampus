import YasalMetinContent from '@/components/landing/yasal/YasalMetinContent';
import { KVKK_META, KVKK_NAV, KVKK_SECTIONS } from '@/lib/kvkk-content';

export default function KvkkContent() {
  return (
    <YasalMetinContent
      meta={KVKK_META}
      nav={KVKK_NAV}
      sections={KVKK_SECTIONS}
    />
  );
}
