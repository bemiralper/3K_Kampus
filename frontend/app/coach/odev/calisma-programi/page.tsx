import { redirect } from 'next/navigation';

type Search = Record<string, string | string[] | undefined>;

export default function LegacyCoachStudyProgramRedirect({
  searchParams,
}: {
  searchParams?: Search;
}) {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (Array.isArray(value)) {
        value.forEach((item) => params.append(key, item));
      } else if (value) {
        params.set(key, value);
      }
    }
  }
  const qs = params.toString();
  redirect(`/coach/calisma-programi${qs ? `?${qs}` : ''}`);
}
