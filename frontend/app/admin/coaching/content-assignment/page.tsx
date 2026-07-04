import { redirect } from 'next/navigation';

// Bu sayfa artık /admin/odev/ver adresine taşındı
export default function ContentAssignmentRedirect() {
  redirect('/admin/odev/ver');
}
