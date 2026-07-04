import { redirect } from 'next/navigation';

type Props = { params: { kod: string } };

export default function LoginKodRedirectPage({ params }: Props) {
  redirect(`/login?kurum=${encodeURIComponent(params.kod)}`);
}
