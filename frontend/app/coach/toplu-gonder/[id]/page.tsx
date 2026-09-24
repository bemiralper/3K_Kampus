import { redirect } from "next/navigation";

/** Eski detay adresi → liste+detay ekranı (`?campaign=`). */
export default function Page({ params }: { params: { id: string } }) {
  redirect(`/coach/toplu-gonder/gecmis?campaign=${encodeURIComponent(params.id)}`);
}
