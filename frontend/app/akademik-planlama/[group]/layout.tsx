import { notFound } from "next/navigation";
import AkademikGroupLayout from "@/components/akademik/AkademikGroupLayout";
import { findAkademikGroup } from "@/lib/akademik-routes";

type LayoutProps = {
  children: React.ReactNode;
  params: { group: string };
};

export default function AkademikGroupRootLayout({ children, params }: LayoutProps) {
  const group = findAkademikGroup(params.group);
  if (!group) {
    notFound();
  }

  return <AkademikGroupLayout group={group}>{children}</AkademikGroupLayout>;
}
