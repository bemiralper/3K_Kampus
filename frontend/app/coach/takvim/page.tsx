import GorevTakvimClient from '@/components/gorev/GorevTakvimClient';

export default function CoachTakvimPage() {
  return (
    <div>
      <GorevTakvimClient backHref="/coach/gorevler" allowPersonalCreate />
    </div>
  );
}
