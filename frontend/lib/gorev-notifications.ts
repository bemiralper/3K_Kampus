/** Görev satırları bildirim kutusundan ayrı, başlıktaki görev düğmesinde durur. */
export function isGorevNotification(item: { url?: string | null }): boolean {
  return (item.url || '').includes('/gorevler');
}
