import { Metadata } from 'next';
import BildirimTercihleriClient from './BildirimTercihleriClient';

export const metadata: Metadata = { title: 'Bildirim Tercihleri — 3K Kampüs' };

export default function BildirimTercihleriPage() {
  return <BildirimTercihleriClient />;
}
