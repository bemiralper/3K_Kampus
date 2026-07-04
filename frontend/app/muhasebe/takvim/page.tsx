import GorevTakvimClient from '@/components/gorev/GorevTakvimClient';

export default function MuhasebeTakvimPage() {
  return (
    <div>
      <GorevTakvimClient backHref="/muhasebe/gorevler" allowPersonalCreate />
    </div>
  );
}
