import { KVKK_META } from "@/lib/kvkk-content";
import KvkkContent from "@/components/landing/yasal/KvkkContent";
import {
  buildYasalStaticMetadata,
  renderYasalStaticPage,
} from "@/lib/yasal-static-page";

export async function generateMetadata() {
  return buildYasalStaticMetadata("/yasal/kvkk", KVKK_META.intro);
}

export default async function KvkkPage() {
  return renderYasalStaticPage(KvkkContent);
}
