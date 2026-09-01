import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Props = { params: { kod: string } };

export default function LoginKodRedirectPage({ params }: Props) {
  redirect(`/login?kurum=${encodeURIComponent(params.kod)}`);
}
