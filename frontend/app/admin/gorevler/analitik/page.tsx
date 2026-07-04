import GorevAnalitikClient from '@/components/gorev/GorevAnalitikClient';
import '@/components/gorev/gorev.css';

export default function AdminGorevAnalitikPage() {
  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <GorevAnalitikClient />
    </div>
  );
}
