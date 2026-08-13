import BildirimlerClient from '@/app/admin/takvim/bildirimler/BildirimlerClient';

export default function CoachBildirimlerPage() {
  return (
    <div className="coach-bildirim-page">
      <BildirimlerClient variant="coach" />
    </div>
  );
}
