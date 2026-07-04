import { Metadata } from 'next';
import BildirimlerClient from './BildirimlerClient';

export const metadata: Metadata = { title: 'Bildirimler — 3K Kampüs' };

export default function BildirimlerPage() {
  return <BildirimlerClient />;
}
