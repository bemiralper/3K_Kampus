import GorevListClient from '@/components/gorev/GorevListClient';
import '@/components/gorev/gorev.css';

export default function MuhasebeGorevlerPage() {
  return (
    <div>
      <GorevListClient basePath="/muhasebe/gorevler" takvimHref="/muhasebe/takvim" />
    </div>
  );
}
