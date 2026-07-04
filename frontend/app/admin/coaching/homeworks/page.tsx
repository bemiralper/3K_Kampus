import { redirect } from 'next/navigation';

// Bu sayfa artık /admin/odev/paketler adresine taşındı
export default function HomeworksRedirect() {
  redirect('/admin/odev/paketler');
}
