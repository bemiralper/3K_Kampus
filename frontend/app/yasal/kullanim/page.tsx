import {
  buildYasalTurMetadata,
  renderYasalTurPage,
} from '@/lib/yasal-tur-page';
import { landingPageDynamic } from '@/lib/landing-page-data';

export const dynamic = landingPageDynamic;

export async function generateMetadata() {
  return buildYasalTurMetadata('kullanim');
}

export default async function KullanimPage() {
  return renderYasalTurPage('kullanim');
}
