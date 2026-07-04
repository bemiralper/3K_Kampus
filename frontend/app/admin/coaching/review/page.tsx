import { redirect } from 'next/navigation';

// Bu sayfa artık /admin/odev/kontrol adresine taşındı
export default function ReviewRedirect() {
  redirect('/admin/odev/kontrol');
}
