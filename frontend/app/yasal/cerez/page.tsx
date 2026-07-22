import {
  buildYasalTurMetadata,
  renderYasalTurPage,
} from '@/lib/yasal-tur-page';
import { landingPageDynamic } from '@/lib/landing-page-data';

export const dynamic = landingPageDynamic;

export async function generateMetadata() {
  return buildYasalTurMetadata('cerez');
}

export default async function CerezPage() {
  return renderYasalTurPage('cerez');
}
