import GorevListClient from '@/components/gorev/GorevListClient';
import '@/components/gorev/gorev.css';

export default function CoachGorevlerPage() {
  return (
    <div>
      <GorevListClient basePath="/coach/gorevler" takvimHref="/coach/takvim" />
    </div>
  );
}
