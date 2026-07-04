import { redirect } from "next/navigation";

export default function OgrenciDuzenlePage({ params }: { params: { id: string } }) {
  redirect(`/ogrenciler/${params.id}?edit=1`);
}
