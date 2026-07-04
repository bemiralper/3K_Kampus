import GorevTakvimClient from '@/components/gorev/GorevTakvimClient';

export default function AdminGorevTakvimPage() {
  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ margin: '0 0 20px', fontSize: 24 }}>Görev Takvimi</h1>
      <GorevTakvimClient backHref="/admin/gorevler" adminView />
    </div>
  );
}
