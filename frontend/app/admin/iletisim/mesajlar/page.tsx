import { redirect } from "next/navigation";

/** Eski inbox adresi — yeni Sohbetler ekranına yönlendirir. */
export default function AdminMesajlarRedirect({
  searchParams,
}: {
  searchParams?: { conversation?: string; filter?: string };
}) {
  const q = new URLSearchParams();
  if (searchParams?.conversation) q.set("conversation", searchParams.conversation);
  if (searchParams?.filter) q.set("filter", searchParams.filter);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  redirect(`/admin/iletisim/sohbetler${suffix}`);
}
