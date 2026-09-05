import { redirect } from "next/navigation";

/** Eski koç inbox adresi — yeni Sohbetler ekranına yönlendirir. */
export default function CoachMesajlarRedirect({
  searchParams,
}: {
  searchParams?: { conversation?: string; filter?: string };
}) {
  const q = new URLSearchParams();
  if (searchParams?.conversation) q.set("conversation", searchParams.conversation);
  if (searchParams?.filter) q.set("filter", searchParams.filter);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  redirect(`/coach/sohbetler${suffix}`);
}
