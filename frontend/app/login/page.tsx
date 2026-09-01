import LoginPageClient from '@/components/login/LoginPageClient';

/** Statik 307 cache Location’suz 404 üretiyordu — giriş siyah ekran. */
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <LoginPageClient />;
}
