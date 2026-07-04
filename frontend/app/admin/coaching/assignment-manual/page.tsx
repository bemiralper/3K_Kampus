import { redirect } from 'next/navigation';

// Bu sayfa artık /admin/odev/ver adresine taşındı
export default function AssignmentManualRedirect() {
  redirect('/admin/odev/ver');
}
