type Viewport = { width: number; height: number };

type PdfPage = {
  getViewport: (params: { scale: number }) => Viewport;
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: Viewport }) => { promise: Promise<void> };
};

type PdfLib = {
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (page: number) => Promise<PdfPage> }> };
  GlobalWorkerOptions: { workerSrc: string };
};

async function pdfLib() {
  const holder = globalThis as typeof globalThis & { pdfjsLib?: PdfLib };
  if (!holder.pdfjsLib) await new Function('return import("/pdf.min.mjs")')();
  const lib = holder.pdfjsLib;
  if (!lib) throw new Error('pdf');
  lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return lib;
}

export async function drawDocument(host: HTMLElement, url: string, mime: string) {
  if (mime.startsWith('image/')) {
    host.replaceChildren();
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.style.display = 'block';
    image.style.maxWidth = '100%';
    image.style.margin = '0 auto';
    host.appendChild(image);
    return;
  }
  const lib = await pdfLib();
  const data = await fetch(url).then((response) => response.arrayBuffer());
  const pdf = await lib.getDocument({ data }).promise;
  if (!host.isConnected) return;
  host.replaceChildren();
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.alignItems = 'center';
  list.style.gap = '12px';
  list.style.padding = '12px';
  host.appendChild(list);
  const width = Math.max(host.clientWidth - 24, 320);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  for (let index = 1; index <= pdf.numPages; index += 1) {
    if (!host.isConnected) return;
    const page = await pdf.getPage(index);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / unscaled.width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    canvas.style.background = '#ffffff';
    const context = canvas.getContext('2d');
    if (!context) continue;
    list.appendChild(canvas);
    await page.render({ canvasContext: context, viewport }).promise;
  }
}
