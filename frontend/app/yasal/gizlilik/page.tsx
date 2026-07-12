import { GIZLILIK_META } from "@/lib/gizlilik-content";
import GizlilikContent from "@/components/landing/yasal/GizlilikContent";
import {
  buildYasalStaticMetadata,
  renderYasalStaticPage,
} from "@/lib/yasal-static-page";

export async function generateMetadata() {
  return buildYasalStaticMetadata("/yasal/gizlilik", GIZLILIK_META.intro);
}

export default async function GizlilikPage() {
  return renderYasalStaticPage(GizlilikContent);
}
