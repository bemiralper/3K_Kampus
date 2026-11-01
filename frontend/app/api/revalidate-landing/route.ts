import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { clearLandingDataCache } from '@/lib/website-api';

/** Kurumsal site admin kaydı sonrası anasayfa SSR önbelleğini temizler */
export async function POST() {
  // revalidatePath, süreç içindeki Map önbelleğini temizlemez.
  clearLandingDataCache();
  revalidatePath('/');
  revalidatePath('/duyurular');
  revalidatePath('/hakkimizda');
  revalidatePath('/3k-sistemi');
  revalidatePath('/yasal/kvkk');
  revalidatePath('/yasal/gizlilik');
  revalidatePath('/yasal/kullanim');
  revalidatePath('/yasal/cerez');
  revalidatePath('/yasal/[tur]', 'page');
  return NextResponse.json({ revalidated: true });
}
