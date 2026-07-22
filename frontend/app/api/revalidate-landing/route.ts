import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

/** Kurumsal site admin kaydı sonrası anasayfa SSR önbelleğini temizler */
export async function POST() {
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
