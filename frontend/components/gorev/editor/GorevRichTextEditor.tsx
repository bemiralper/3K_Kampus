'use client';

import React, {
  forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { generateHTML, generateJSON } from '@tiptap/html';
import CodeMirror from '@uiw/react-codemirror';
import { html as htmlLang } from '@codemirror/lang-html';
import { EditorView } from '@codemirror/view';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import katex from 'katex';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, Code2, Eraser,
  Heading1, Heading2, Heading3, Highlighter, ImagePlus, IndentDecrease, IndentIncrease,
  Italic, Link2, List, ListOrdered, ListTodo, Maximize2, Minimize2, Minus, Paperclip,
  Pilcrow, Printer, Quote, Redo2, RemoveFormatting, Search, Sigma, Smile, Strikethrough,
  Subscript, Superscript, Table2, Underline, Undo2,
} from 'lucide-react';
import { importGorevImageFromUrl, uploadGorevDosya, type GorevDosya } from '@/lib/gorev-api';
import { createGorevExtensions } from './extensions';
import {
  extractDosyaIds, featureCounts, formatHtml, htmlWarnings, normalizeDosyaSrc, normalizeHref,
  normalizeOutgoing, sanitizeGorevHtml, toEditorHtml, unknownTags,
} from './html';
import 'katex/dist/katex.min.css';
import './gorev-editor.css';

export type GorevEditorHandle = {
  getHtml: () => string;
  getUploadedIds: () => string[];
};

type Mode = 'visual' | 'html' | 'preview';
type UploadState = { key: string; name: string; progress: number; error?: string; file?: File };

const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma'];
const SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
const LINE_HEIGHTS = ['1', '1.15', '1.5', '1.75', '2'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const FILE_ACCEPT = '.pdf,.docx,.xlsx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation';
const TEMPLATES = [
  {
    id: 'toplanti',
    label: 'Toplantı notu',
    html: '<h2>Toplantı notu</h2><p><strong>Tarih:</strong> </p><p><strong>Katılımcılar:</strong> </p><h3>Gündem</h3><ul><li><p></p></li></ul><h3>Kararlar</h3><ol><li><p></p></li></ol>',
  },
  {
    id: 'kontrol',
    label: 'Kontrol listesi',
    html: '<h2>Kontrol listesi</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>İlk madde</p></div></li></ul>',
  },
  {
    id: 'duyuru',
    label: 'Duyuru',
    html: '<h2>Duyuru</h2><p><strong>Kime:</strong> </p><p></p><blockquote><p>Önemli not</p></blockquote>',
  },
];
const SYMBOLS = ['©', '®', '™', '€', '£', '₺', '§', '•', '–', '—', '…', '«', '»', '“', '”', '±', '×', '÷', '≠', '≤', '≥', '∞', '√', '∑', '∏', '∫', 'π', 'α', 'β', 'θ', 'Δ', 'Ω'];
const SHORTCUTS: [string, string][] = [
  ['Ctrl/⌘ + B', 'Kalın'],
  ['Ctrl/⌘ + I', 'İtalik'],
  ['Ctrl/⌘ + U', 'Altı çizili'],
  ['Ctrl/⌘ + Shift + X', 'Üstü çizili'],
  ['Ctrl/⌘ + Z', 'Geri al'],
  ['Ctrl/⌘ + Shift + Z', 'Yinele'],
  ['Ctrl/⌘ + F', 'Bul ve değiştir'],
  ['Ctrl/⌘ + K', 'Bağlantı'],
];

const MATH_SNIPPETS = [
  { label: 'Kesir', latex: '\\frac{a}{b}' },
  { label: 'Üs', latex: 'x^{n}' },
  { label: 'Alt indis', latex: 'x_{n}' },
  { label: 'Karekök', latex: '\\sqrt{x}' },
  { label: 'n. kök', latex: '\\sqrt[n]{x}' },
  { label: 'Eşitlik', latex: 'a = b' },
  { label: 'Eşitsizlik', latex: 'a \\le b' },
  { label: 'Parantez', latex: '\\left( a + b \\right)' },
  { label: 'Çarpma / bölme', latex: 'a \\times b \\div c' },
  { label: 'Toplam', latex: '\\sum_{i=1}^{n} a_i' },
  { label: 'Çarpım', latex: '\\prod_{i=1}^{n} a_i' },
  { label: 'İntegral', latex: '\\int_{a}^{b} f(x)\\,dx' },
  { label: 'Mutlak değer', latex: '\\left| x \\right|' },
  { label: 'Yunan', latex: '\\alpha,\\ \\beta,\\ \\pi,\\ \\theta,\\ \\Delta' },
];

type ConfirmState = { message: string; yesLabel: string; noLabel: string; yes: () => void; no: () => void };
type MathState = { latex: string; display: boolean; pos?: number; kind?: string };

function ToolButton({
  title, active, disabled, onClick, children, prominent,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  prominent?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rte-btn${active ? ' is-active' : ''}${prominent ? ' rte-btn--plug' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      disabled={disabled}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const GorevRichTextEditor = forwardRef<GorevEditorHandle, { value: string; onReady?: () => void }>(
  function GorevRichTextEditor({ value, onReady }, ref) {
    const initial = useMemo(() => toEditorHtml(value), [value]);
    const [mode, setMode] = useState<Mode>('visual');
    const [htmlDraft, setHtmlDraft] = useState(initial);
    const [more, setMore] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [notice, setNotice] = useState('');
    const [uploads, setUploads] = useState<UploadState[]>([]);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState('https://');
    const [linkText, setLinkText] = useState('');
    const [findOpen, setFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState('');
    const [replaceQuery, setReplaceQuery] = useState('');
    const [findIndex, setFindIndex] = useState(0);
    const [mathOpen, setMathOpen] = useState<MathState | null>(null);
    const [altText, setAltText] = useState('');
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [symbolOpen, setSymbolOpen] = useState(false);
    const [tableOpen, setTableOpen] = useState(false);
    const [templateOpen, setTemplateOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [hoverCell, setHoverCell] = useState({ r: 2, c: 2 });
    const uploadedIds = useRef<string[]>([]);
    const pasteRef = useRef<(event: ClipboardEvent) => boolean>(() => false);
    const imageInput = useRef<HTMLInputElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const readySent = useRef(false);
    const modeRef = useRef<Mode>('visual');
    modeRef.current = mode;

    const editor = useEditor({
      immediatelyRender: false,
      extensions: createGorevExtensions(),
      content: initial,
      editorProps: {
        attributes: { class: 'rte-prose', spellcheck: 'true' },
        handleKeyDown: (_view, event) => {
          const meta = event.metaKey || event.ctrlKey;
          if (meta && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            setFindOpen(true);
            return true;
          }
          if (meta && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            openLink();
            return true;
          }
          return false;
        },
        handlePaste: (_view, event) => pasteRef.current(event),
        handleDrop: (_view, event) => {
          if (!event.dataTransfer?.files?.length) return false;
          event.preventDefault();
          void ingestFiles(event.dataTransfer.files);
          return true;
        },
        transformPastedHTML: pasted => pasted.replace(/<img\b[^>]*>/gi, tag => {
          const src = /src=["']([^"']+)["']/i.exec(tag)?.[1] || '';
          return normalizeDosyaSrc(src) ? tag : '';
        }),
      },
    });

    useEffect(() => {
      if (editor && !readySent.current) {
        readySent.current = true;
        onReady?.();
      }
    }, [editor, onReady]);

    useEffect(() => {
      if (!editor) return;
      (editor.storage as { gorevUi?: { openMath: (payload: MathState) => void } }).gorevUi = {
        openMath: payload => setMathOpen({ ...payload, display: payload.kind === 'mathBlock', latex: payload.latex }),
      };
    }, [editor]);

    useEffect(() => {
      if (!fullscreen) return;
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setFullscreen(false);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [fullscreen]);

    const currentHtml = () => {
      if (modeRef.current === 'html') return htmlDraft;
      if (editor && modeRef.current === 'visual') return editor.getHTML();
      return htmlDraft;
    };

    useImperativeHandle(ref, () => ({
      getHtml: () => normalizeOutgoing(currentHtml()),
      getUploadedIds: () => [...uploadedIds.current],
    }));

    function dataUrlToFile(src: string): File | null {
      const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,([a-z0-9+/=\s]+)$/i.exec(src.trim());
      if (!match) return null;
      try {
        const binary = atob(match[2].replace(/\s/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const subtype = match[1].split('/')[1].toLowerCase().replace('jpeg', 'jpg');
        return new File([bytes], `yapistirma.${subtype}`, { type: match[1].toLowerCase().replace('jpg', 'jpeg') });
      } catch {
        return null;
      }
    }

    async function fetchImageFile(url: string): Promise<File | null> {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) return null;
        const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (type && !type.startsWith('image/')) return null;
        const blob = await res.blob();
        if (!blob.size || blob.size > 5 * 1024 * 1024) return null;
        const subtype = (type || blob.type || 'image/jpeg').split('/')[1]?.toLowerCase().replace('jpeg', 'jpg') || 'jpg';
        const ext = ['jpg', 'png', 'gif', 'webp'].includes(subtype) ? subtype : 'jpg';
        return new File([blob], `yapistirma.${ext}`, { type: type.startsWith('image/') ? type : `image/${ext === 'jpg' ? 'jpeg' : ext}` });
      } catch {
        return null;
      }
    }

    async function importPastedImage(src: string): Promise<GorevDosya | null> {
      const known = normalizeDosyaSrc(src);
      if (known) return { id: '', url: known, orijinal_ad: '', boyut: 0, icerik_turu: 'image/jpeg', tur: 'gorsel' };
      if (src.startsWith('data:')) {
        const file = dataUrlToFile(src);
        if (!file) return null;
        const res = await uploadGorevDosya(file);
        return res.success && res.data ? res.data : null;
      }
      const absolute = src.startsWith('//') ? `https:${src}` : src;
      if (!/^https?:\/\//i.test(absolute)) return null;
      const local = await fetchImageFile(absolute);
      if (local) {
        const uploaded = await uploadGorevDosya(local);
        if (uploaded.success && uploaded.data) return uploaded.data;
      }
      const res = await importGorevImageFromUrl(absolute);
      return res.success && res.data ? res.data : null;
    }

    function replaceImageMarker(marker: string, dosya: GorevDosya) {
      if (!editor) return;
      let found: { from: number; to: number } | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (found || !node.isText || !node.text) return;
        const index = node.text.indexOf(marker);
        if (index < 0) return;
        const start = pos + index;
        const $pos = editor.state.doc.resolve(start);
        if ($pos.parent.type.name === 'paragraph' && $pos.parent.textContent === marker) {
          found = { from: $pos.before(), to: $pos.after() };
        } else {
          found = { from: start, to: start + marker.length };
        }
      });
      if (!found) return;
      const range = found;
      if (!dosya.url) {
        editor.chain().focus().deleteRange(range).run();
        return;
      }
      editor.chain().focus().insertContentAt(range, {
        type: 'gorevImage',
        attrs: { src: dosya.url, alt: '', dosyaId: dosya.id, align: 'center' },
      }).run();
    }

    function pastedImageUrl(img: HTMLImageElement, pageUrl: string): string {
      const width = Number(img.getAttribute('width') || 0);
      const height = Number(img.getAttribute('height') || 0);
      if (width > 0 && height > 0 && width < 40 && height < 40) return '';
      const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
      const fromSet = srcset.split(',').map(part => part.trim().split(/\s+/)[0]).filter(Boolean);
      const candidates = [
        img.getAttribute('src') || '',
        img.getAttribute('data-src') || '',
        img.getAttribute('data-original') || '',
        img.getAttribute('data-lazy-src') || '',
        fromSet[fromSet.length - 1] || '',
      ];
      for (const raw of candidates) {
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('data:image/svg') || /\.svg(\?|$)/i.test(trimmed)) continue;
        if (trimmed.startsWith('data:image/') && trimmed.length < 200) continue;
        if (/pixel|beacon|\/match\?|tracking|spacer|1x1/i.test(trimmed)) continue;
        if (trimmed.startsWith('//')) return `https:${trimmed}`;
        if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image/') || trimmed.startsWith('/api/gorev/')) return trimmed;
        if (pageUrl && trimmed.startsWith('/')) {
          try { return new URL(trimmed, pageUrl).href; } catch { /* ignore */ }
        }
      }
      return '';
    }

    async function pasteHtmlWithImages(html: string) {
      if (!editor) return;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const pageUrl = /SourceURL:(\S+)/i.exec(html)?.[1] || doc.querySelector('base')?.getAttribute('href') || '';
      const picked: { img: HTMLImageElement; src: string }[] = [];
      for (const img of [...doc.querySelectorAll('img')]) {
        if (picked.length >= 8) {
          img.remove();
          continue;
        }
        const src = pastedImageUrl(img, pageUrl);
        if (!src) {
          img.remove();
          continue;
        }
        picked.push({ img, src });
      }
      const sources = picked.map(item => item.src);
      picked.forEach(({ img }, index) => {
        const mark = doc.createElement('p');
        mark.textContent = `⟦gimg:${index}⟧`;
        img.replaceWith(mark);
      });
      const safe = sanitizeGorevHtml(doc.body.innerHTML);
      if (safe.replace(/<[^>]+>/g, '').trim() || /<table\b/i.test(safe)) {
        editor.chain().focus().insertContent(safe).run();
      }
      let failed = 0;
      for (let index = 0; index < sources.length; index += 1) {
        const dosya = await importPastedImage(sources[index]);
        if (!dosya?.url) {
          failed += 1;
          replaceImageMarker(`⟦gimg:${index}⟧`, { id: '', url: '', orijinal_ad: '', boyut: 0, icerik_turu: '', tur: 'gorsel' });
          continue;
        }
        if (dosya.id) uploadedIds.current = [...new Set([...uploadedIds.current, dosya.id])];
        replaceImageMarker(`⟦gimg:${index}⟧`, dosya);
      }
      if (failed) setNotice(failed === sources.length ? 'Yapıştırılan görseller eklenemedi.' : `${failed} görsel eklenemedi.`);
    }

    function ingestClipboard(data: DataTransfer | null, event: ClipboardEvent) {
      const files = data ? [...data.files] : [];
      const html = data?.getData('text/html') || '';
      const hasImage = /<img\b/i.test(html);
      if (hasImage) {
        event.preventDefault();
        void pasteHtmlWithImages(html);
        return true;
      }
      if (!files.length) return false;
      event.preventDefault();
      void ingestFiles(files);
      return true;
    }

    pasteRef.current = event => ingestClipboard(event.clipboardData, event);

    async function ingestFiles(list: FileList | File[]) {
      const files = [...list];
      for (const file of files) {
        const image = IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|gif|webp)$/i.test(file.name);
        await sendFile(file, image ? 'gorsel' : 'dosya');
      }
    }

    async function sendFile(file: File, kind: 'gorsel' | 'dosya', retryKey?: string) {
      const key = retryKey || `${Date.now()}-${file.name}`;
      if (kind === 'gorsel' && file.size > 5 * 1024 * 1024) {
        setNotice('Görsel en fazla 5 MB olabilir.');
        return;
      }
      if (kind === 'dosya' && file.size > 15 * 1024 * 1024) {
        setNotice('Dosya en fazla 15 MB olabilir.');
        return;
      }
      setUploads(prev => {
        const next = prev.filter(item => item.key !== key);
        return [...next, { key, name: file.name, progress: 0, file }];
      });
      const res = await uploadGorevDosya(file, pct => {
        setUploads(prev => prev.map(item => (item.key === key ? { ...item, progress: pct } : item)));
      });
      if (!res.success || !res.data) {
        setUploads(prev => prev.map(item => (item.key === key ? { ...item, error: res.error || 'Yüklenemedi', progress: 0 } : item)));
        return;
      }
      uploadedIds.current = [...new Set([...uploadedIds.current, res.data.id])];
      setUploads(prev => prev.filter(item => item.key !== key));
      insertUploaded(res.data, kind);
    }

    function insertUploaded(dosya: GorevDosya, kind: 'gorsel' | 'dosya') {
      if (!editor) return;
      if (kind === 'gorsel') {
        editor.chain().focus().insertContent({
          type: 'gorevImage',
          attrs: { src: dosya.url, alt: '', dosyaId: dosya.id, align: 'center' },
        }).run();
        return;
      }
      editor.chain().focus().insertContent({
        type: 'gorevFile',
        attrs: {
          dosyaId: dosya.id,
          name: dosya.orijinal_ad,
          size: dosya.boyut,
          mime: dosya.icerik_turu,
          href: dosya.url,
        },
      }).run();
    }

    function openLink() {
      if (!editor) return;
      const previous = editor.getAttributes('link').href as string | undefined;
      const { from, to } = editor.state.selection;
      setLinkText(editor.state.doc.textBetween(from, to, ' '));
      setLinkUrl(previous || 'https://');
      setLinkOpen(true);
    }

    function applyLink() {
      if (!editor) return;
      const href = normalizeHref(linkUrl);
      if (!href) {
        setNotice('Bağlantı http, https, mailto veya görev dosyası olmalıdır.');
        return;
      }
      const chain = editor.chain().focus();
      if (linkText && editor.state.selection.empty) {
        chain.insertContent(`<a href="${href}">${linkText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a>`).run();
      } else {
        chain.extendMarkRange('link').setLink({ href }).run();
      }
      setLinkOpen(false);
    }

    function findRanges(query: string) {
      if (!editor || !query) return [];
      const q = query.toLowerCase();
      const ranges: { from: number; to: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        const text = node.text.toLowerCase();
        let index = 0;
        while ((index = text.indexOf(q, index)) !== -1) {
          ranges.push({ from: pos + index, to: pos + index + query.length });
          index += query.length;
        }
      });
      return ranges;
    }

    function jumpFind(next: boolean) {
      const ranges = findRanges(findQuery);
      if (!ranges.length || !editor) {
        setNotice(findQuery ? 'Eşleşme bulunamadı.' : '');
        return;
      }
      const index = (findIndex + (next ? 1 : -1) + ranges.length) % ranges.length;
      setFindIndex(index);
      const range = ranges[index];
      editor.chain().focus().setTextSelection(range).scrollIntoView().run();
    }

    function replaceOne() {
      const ranges = findRanges(findQuery);
      if (!ranges.length || !editor) return;
      const range = ranges[Math.min(findIndex, ranges.length - 1)];
      editor.chain().focus().insertContentAt(range, replaceQuery).run();
    }

    function replaceAll() {
      if (!editor || !findQuery) return;
      const ranges = findRanges(findQuery).reverse();
      ranges.forEach(range => editor.chain().insertContentAt(range, replaceQuery).run());
    }

    function applyMath() {
      if (!editor || !mathOpen) return;
      const latex = mathOpen.latex.trim();
      if (!latex) return;
      if (typeof mathOpen.pos === 'number' && mathOpen.kind) {
        editor.chain().focus().setNodeSelection(mathOpen.pos).updateAttributes(mathOpen.kind, { latex }).run();
      } else {
        editor.chain().focus().insertContent({
          type: mathOpen.display ? 'mathBlock' : 'mathInline',
          attrs: { latex },
        }).run();
      }
      setMathOpen(null);
    }

    function roundTrip(source: string) {
      const extensions = createGorevExtensions();
      return generateHTML(generateJSON(source, extensions), extensions);
    }

    function showVisual(source: string) {
      editor?.commands.setContent(source || '<p></p>', false);
      setHtmlDraft(editor?.getHTML() || source);
      setMode('visual');
    }

    function goVisual() {
      if (modeRef.current === 'visual') return;
      const source = htmlDraft;
      let round = source;
      let failed = false;
      try {
        round = roundTrip(source);
      } catch {
        failed = true;
      }
      const unknown = unknownTags(source);
      const before = featureCounts(source);
      const after = featureCounts(round);
      const loss = failed || unknown.length > 0 || before.img > after.img || before.table > after.table
        || before.math > after.math || before.file > after.file;
      if (!loss) {
        showVisual(source);
        return;
      }
      const detail = unknown.length ? ` Desteklenmeyen öğeler: ${unknown.join(', ')}.` : '';
      setConfirm({
        message: `Görsel editör bu kaynağın bir kısmını birebir gösteremeyebilir.${detail} Geçiş, kaydedilecek içeriği görsel editörün ürettiği HTML yapar.`,
        yesLabel: 'Görsel moda geç',
        noLabel: 'Kaynakta kal',
        yes: () => {
          showVisual(source);
          setConfirm(null);
        },
        no: () => setConfirm(null),
      });
    }

    function goHtml() {
      const next = editor?.getHTML() || htmlDraft;
      setHtmlDraft(next);
      setMode('html');
    }

    function goPreview() {
      if (mode === 'visual' && editor) setHtmlDraft(editor.getHTML());
      setMode('preview');
    }

    function clearAll() {
      setConfirm({
        message: 'Açıklamadaki tüm içerik silinsin mi? Bu işlem kaydedilene kadar geri alınabilir.',
        yesLabel: 'İçeriği temizle',
        noLabel: 'Vazgeç',
        yes: () => {
          editor?.chain().focus().clearContent().run();
          setHtmlDraft('');
          setConfirm(null);
        },
        no: () => setConfirm(null),
      });
    }

    function printView() {
      const safe = sanitizeGorevHtml(currentHtml());
      const withMath = safe.replace(/<(span|div)\b([^>]*data-latex="([^"]*)"[^>]*)><\/\1>/gi, (_all, tag, _attrs, latex) => {
        const rendered = katex.renderToString(latex, { throwOnError: false, displayMode: tag.toLowerCase() === 'div' });
        return `<div class="math">${rendered}</div>`;
      });
      const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
      if (!popup) {
        setNotice('Yazdırma penceresi açılamadı.');
        return;
      }
      popup.document.write(`<!DOCTYPE html><html><head><title>Görev açıklaması</title><style>
        body{font-family:Arial,sans-serif;padding:32px;color:#0f172a;line-height:1.5}
        img{max-width:100%;height:auto} table{border-collapse:collapse;width:100%} td,th{border:1px solid #cbd5e1;padding:6px}
        blockquote{border-left:3px solid #0061A6;margin:0;padding-left:12px;color:#334155}
        a{color:#0061A6}
      </style></head><body>${withMath}</body></html>`);
      popup.document.close();
      popup.focus();
      popup.print();
    }

    async function copyContent() {
      if (!editor) return;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([editor.getHTML()], { type: 'text/html' }),
            'text/plain': new Blob([editor.getText()], { type: 'text/plain' }),
          }),
        ]);
        setNotice('İçerik panoya kopyalandı.');
      } catch {
        setNotice('Panoya kopyalanamadı. Ctrl/⌘+C kullanabilirsiniz.');
      }
    }

    async function pasteContent() {
      if (!editor) return;
      try {
        const text = await navigator.clipboard.readText();
        editor.chain().focus().insertContent(text).run();
      } catch {
        setNotice('Panodan okunamadı. Ctrl/⌘+V kullanabilirsiniz.');
      }
    }

    const text = mode === 'visual'
      ? (editor?.getText() || '')
      : htmlDraft.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const previewSource = mode === 'preview' ? htmlDraft : '';
    const previewHtml = mode === 'preview' ? sanitizeGorevHtml(previewSource) : '';
    const warnings = mode === 'html' ? htmlWarnings(htmlDraft) : [];
    const inTable = Boolean(editor?.isActive('table'));
    const imageAttrs = editor?.getAttributes('gorevImage') || {};

    return (
      <div className={`rte-root${fullscreen ? ' is-fullscreen' : ''}${more ? ' is-more-open' : ''}`}>
        <div className="rte-modes" role="tablist" aria-label="Düzenleme modu">
          <button type="button" role="tab" aria-selected={mode === 'visual'} className={mode === 'visual' ? 'is-active' : ''} onClick={goVisual}>Görsel</button>
          <button type="button" role="tab" aria-selected={mode === 'html'} className={mode === 'html' ? 'is-active' : ''} onClick={goHtml}>HTML</button>
          <button type="button" role="tab" aria-selected={mode === 'preview'} className={mode === 'preview' ? 'is-active' : ''} onClick={goPreview}>Önizleme</button>
          <span className="rte-mode-space" />
          <ToolButton title={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'} onClick={() => setFullscreen(v => !v)}>
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </ToolButton>
        </div>

        {mode === 'visual' && editor && (
          <>
            <div className="rte-toolbar" role="toolbar" aria-label="Biçimlendirme">
              <div className="rte-group">
                <ToolButton title="Geri al" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 size={16} /></ToolButton>
                <ToolButton title="Yinele" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 size={16} /></ToolButton>
              </div>
              <div className="rte-group">
                <ToolButton title="Kalın" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolButton>
                <ToolButton title="İtalik" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolButton>
                <ToolButton title="Altı çizili" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline size={16} /></ToolButton>
                <ToolButton title="Üstü çizili" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={16} /></ToolButton>
              </div>
              <div className="rte-group">
                <ToolButton title="Madde işaretli liste" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></ToolButton>
                <ToolButton title="Numaralı liste" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolButton>
                <ToolButton title="Yapılacaklar" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListTodo size={16} /></ToolButton>
              </div>
              <div className="rte-group">
                <ToolButton title="Bağlantı" active={editor.isActive('link')} onClick={openLink}><Link2 size={16} /></ToolButton>
                <ToolButton prominent title="Görsel ekle" onClick={() => imageInput.current?.click()}><ImagePlus size={16} /> Görsel</ToolButton>
                <ToolButton prominent title="Dosya ekle" onClick={() => fileInput.current?.click()}><Paperclip size={16} /> Dosya</ToolButton>
                <ToolButton prominent title="Tablo" active={tableOpen} onClick={() => setTableOpen(v => !v)}><Table2 size={16} /> Tablo</ToolButton>
                <ToolButton prominent title="Denklem" onClick={() => setMathOpen({ latex: '', display: false })}><Sigma size={16} /> Denklem</ToolButton>
              </div>
              <button type="button" className="rte-more-toggle" onClick={() => setMore(v => !v)} aria-expanded={more}>Diğer</button>
              <div className="rte-advanced">
                <div className="rte-group">
                  <ToolButton title="Başlık 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={16} /></ToolButton>
                  <ToolButton title="Başlık 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolButton>
                  <ToolButton title="Başlık 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></ToolButton>
                  <ToolButton title="Paragraf" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()}><Pilcrow size={16} /></ToolButton>
                  <ToolButton title="Biçimi temizle" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={16} /></ToolButton>
                </div>
                <div className="rte-group rte-selects">
                  <select aria-label="Yazı tipi" value={editor.getAttributes('textStyle').fontFamily || ''} onChange={event => event.target.value ? editor.chain().focus().setFontFamily(event.target.value).run() : editor.chain().focus().unsetFontFamily().run()}>
                    <option value="">Yazı tipi</option>
                    {FONTS.map(font => <option key={font} value={font}>{font}</option>)}
                  </select>
                  <select aria-label="Punto" value={editor.getAttributes('textStyle').fontSize || ''} onChange={event => event.target.value ? editor.chain().focus().setFontSize(event.target.value).run() : editor.chain().focus().unsetFontSize().run()}>
                    <option value="">Punto</option>
                    {SIZES.map(size => <option key={size} value={size}>{size.replace('px', '')}</option>)}
                  </select>
                  <label className="rte-color" title="Metin rengi">
                    <Baseline size={16} />
                    <input aria-label="Metin rengi" type="color" onChange={event => editor.chain().focus().setColor(event.target.value).run()} />
                  </label>
                  <label className="rte-color" title="Vurgu rengi">
                    <Highlighter size={16} />
                    <input aria-label="Vurgu rengi" type="color" defaultValue="#fff3bf" onChange={event => editor.chain().focus().toggleHighlight({ color: event.target.value }).run()} />
                  </label>
                </div>
                <div className="rte-group">
                  <ToolButton title="Sola hizala" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={16} /></ToolButton>
                  <ToolButton title="Ortala" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={16} /></ToolButton>
                  <ToolButton title="Sağa hizala" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={16} /></ToolButton>
                  <ToolButton title="İki yana yasla" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify size={16} /></ToolButton>
                  <ToolButton title="Girintiyi artır" onClick={() => editor.chain().focus().increaseIndent().run()}><IndentIncrease size={16} /></ToolButton>
                  <ToolButton title="Girintiyi azalt" onClick={() => editor.chain().focus().decreaseIndent().run()}><IndentDecrease size={16} /></ToolButton>
                  <select aria-label="Satır aralığı" value="" onChange={event => { if (event.target.value) editor.chain().focus().setLineHeight(event.target.value).run(); }}>
                    <option value="">Aralık</option>
                    {LINE_HEIGHTS.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="rte-group">
                  <ToolButton title="Üst simge" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}><Superscript size={16} /></ToolButton>
                  <ToolButton title="Alt simge" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}><Subscript size={16} /></ToolButton>
                  <ToolButton title="Alıntı" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></ToolButton>
                  <ToolButton title="Yatay çizgi" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={16} /></ToolButton>
                  <ToolButton title="Kod bloğu" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 size={16} /></ToolButton>
                </div>
                <div className="rte-group">
                  <ToolButton title="Bul ve değiştir" onClick={() => setFindOpen(true)}><Search size={16} /></ToolButton>
                  <ToolButton title="Özel karakter" active={symbolOpen} onClick={() => { setSymbolOpen(v => !v); setEmojiOpen(false); }}><span aria-hidden>Ω</span></ToolButton>
                  <ToolButton title="Emoji" active={emojiOpen} onClick={() => { setEmojiOpen(v => !v); setSymbolOpen(false); }}><Smile size={16} /></ToolButton>
                  <ToolButton title="Kopyala" onClick={() => void copyContent()}><span aria-hidden>Kopya</span></ToolButton>
                  <ToolButton title="Yapıştır" onClick={() => void pasteContent()}><span aria-hidden>Yapıştır</span></ToolButton>
                  <ToolButton title="Şablon" active={templateOpen} onClick={() => setTemplateOpen(v => !v)}><span aria-hidden>Şablon</span></ToolButton>
                  <ToolButton title="Yazdır" onClick={printView}><Printer size={16} /></ToolButton>
                  <ToolButton title="Kısayollar" onClick={() => setHelpOpen(true)}><span aria-hidden>?</span></ToolButton>
                  <ToolButton title="İçeriği temizle" onClick={clearAll}><Eraser size={16} /></ToolButton>
                </div>
              </div>
            </div>

            {tableOpen && (
              <div className="rte-pop">
                <div className="rte-grid" onMouseLeave={() => setHoverCell({ r: 2, c: 2 })}>
                  {Array.from({ length: 5 }, (_, r) => (
                    <div key={r}>
                      {Array.from({ length: 5 }, (_, c) => (
                        <button
                          type="button"
                          key={c}
                          className={r <= hoverCell.r && c <= hoverCell.c ? 'is-on' : ''}
                          aria-label={`${r + 1} satır ${c + 1} sütun`}
                          onMouseEnter={() => setHoverCell({ r, c })}
                          onClick={() => {
                            editor.chain().focus().insertTable({ rows: r + 1, cols: c + 1, withHeaderRow: true }).run();
                            setTableOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <span>{hoverCell.r + 1} × {hoverCell.c + 1}</span>
              </div>
            )}

            {inTable && (
              <div className="rte-context">
                <ToolButton title="Üste satır" onClick={() => editor.chain().focus().addRowBefore().run()}>+ satır</ToolButton>
                <ToolButton title="Alta satır" onClick={() => editor.chain().focus().addRowAfter().run()}>satır +</ToolButton>
                <ToolButton title="Satırı sil" onClick={() => editor.chain().focus().deleteRow().run()}>satır sil</ToolButton>
                <ToolButton title="Sola sütun" onClick={() => editor.chain().focus().addColumnBefore().run()}>+ sütun</ToolButton>
                <ToolButton title="Sağa sütun" onClick={() => editor.chain().focus().addColumnAfter().run()}>sütun +</ToolButton>
                <ToolButton title="Sütunu sil" onClick={() => editor.chain().focus().deleteColumn().run()}>sütun sil</ToolButton>
                <ToolButton title="Hücreleri birleştir" onClick={() => editor.chain().focus().mergeCells().run()}>birleştir</ToolButton>
                <ToolButton title="Hücreyi ayır" onClick={() => editor.chain().focus().splitCell().run()}>ayır</ToolButton>
                <ToolButton title="Başlık satırı" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>başlık</ToolButton>
                <ToolButton title="Sola" onClick={() => editor.chain().focus().setCellAttribute('textAlign', 'left').run()}>sol</ToolButton>
                <ToolButton title="Ortala" onClick={() => editor.chain().focus().setCellAttribute('textAlign', 'center').run()}>orta</ToolButton>
                <ToolButton title="Sağa" onClick={() => editor.chain().focus().setCellAttribute('textAlign', 'right').run()}>sağ</ToolButton>
                <label className="rte-color" title="Hücre rengi">
                  dolgu
                  <input aria-label="Hücre arka planı" type="color" onChange={event => editor.chain().focus().setCellAttribute('backgroundColor', event.target.value).run()} />
                </label>
                <ToolButton title="Tabloyu sil" onClick={() => editor.chain().focus().deleteTable().run()}>tabloyu sil</ToolButton>
              </div>
            )}

            {editor.isActive('gorevImage') && (
              <div className="rte-context">
                <label>Alt metin
                  <input value={altText || imageAttrs.alt || ''} onChange={event => { setAltText(event.target.value); editor.chain().focus().updateAttributes('gorevImage', { alt: event.target.value }).run(); }} />
                </label>
                {['25%', '50%', '75%', '100%'].map(width => (
                  <ToolButton key={width} title={`Genişlik ${width}`} onClick={() => editor.chain().focus().updateAttributes('gorevImage', { width }).run()}>{width}</ToolButton>
                ))}
                <ToolButton title="Metnin soluna al" onClick={() => {
                  const width = String(imageAttrs.width || '');
                  editor.chain().focus().updateAttributes('gorevImage', {
                    align: 'left',
                    width: !width || width === '100%' ? '45%' : width,
                  }).run();
                }}>Metnin solu</ToolButton>
                <ToolButton title="Satırda ortala" onClick={() => editor.chain().focus().updateAttributes('gorevImage', { align: 'center' }).run()}>Ortaya</ToolButton>
                <ToolButton title="Metnin sağına al" onClick={() => {
                  const width = String(imageAttrs.width || '');
                  editor.chain().focus().updateAttributes('gorevImage', {
                    align: 'right',
                    width: !width || width === '100%' ? '45%' : width,
                  }).run();
                }}>Metnin sağı</ToolButton>
              </div>
            )}

            {symbolOpen && (
              <div className="rte-pop rte-symbols">
                {SYMBOLS.map(symbol => (
                  <button type="button" key={symbol} onClick={() => editor.chain().focus().insertContent(symbol).run()}>{symbol}</button>
                ))}
              </div>
            )}
            {emojiOpen && (
              <div className="rte-pop rte-emoji">
                <EmojiPicker onEmojiClick={(emoji: EmojiClickData) => editor.chain().focus().insertContent(emoji.emoji).run()} width="min(320px, calc(100vw - 48px))" height={360} />
              </div>
            )}
            {templateOpen && (
              <div className="rte-pop rte-menu">
                {TEMPLATES.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      const apply = () => {
                        editor.chain().focus().insertContent(item.html).run();
                        setTemplateOpen(false);
                        setConfirm(null);
                      };
                      if (editor.getText().trim()) {
                        setConfirm({
                          message: 'Şablon mevcut metnin imleç konumuna eklensin mi?',
                          yesLabel: 'Ekle',
                          noLabel: 'Vazgeç',
                          yes: apply,
                          no: () => setConfirm(null),
                        });
                      } else apply();
                    }}
                  >{item.label}</button>
                ))}
              </div>
            )}

            <EditorContent editor={editor} />
          </>
        )}

        {mode === 'html' && (
          <div className="rte-code">
            <div className="rte-code-tools">
              <button type="button" onClick={() => setHtmlDraft(formatHtml(htmlDraft))}>Biçimlendir</button>
              <span>Doğrudan HTML. Kayıt sırasında güvenlik temizlemesi uygulanır.</span>
            </div>
            <CodeMirror
              value={htmlDraft}
              height="420px"
              theme="light"
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                indentOnInput: true,
                searchKeymap: true,
                highlightActiveLine: true,
              }}
              extensions={[htmlLang(), EditorView.lineWrapping]}
              onChange={setHtmlDraft}
            />
            {warnings.length > 0 && (
              <ul className="rte-warnings">
                {warnings.map(item => <li key={item}>{item}</li>)}
              </ul>
            )}
          </div>
        )}

        {mode === 'preview' && (
          <Preview html={previewHtml} />
        )}

        <p className="rte-hint">
          Görseller: JPG, PNG, GIF, WEBP · en fazla 5 MB. Dosyalar: PDF, DOCX, XLSX, PPTX · en fazla 15 MB.
          Sürükleyip bırakabilir veya panodan yapıştırabilirsiniz.
        </p>
        {uploads.length > 0 && (
          <ul className="rte-uploads">
            {uploads.map(item => (
              <li key={item.key}>
                <span>{item.name}</span>
                {item.error ? <span className="is-error">{item.error}</span> : <span>%{item.progress}</span>}
                {item.error && item.file && (
                  <button type="button" onClick={() => void sendFile(item.file!, IMAGE_TYPES.includes(item.file!.type) ? 'gorsel' : 'dosya', item.key)}>Yeniden dene</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {notice && <p className="rte-notice" role="status">{notice}</p>}
        <div className="rte-footer">
          <span>{words} kelime</span>
          <span>{text.length} karakter</span>
          {extractDosyaIds(currentHtml()).length > 0 && <span>{extractDosyaIds(currentHtml()).length} dosya</span>}
        </div>

        <input ref={imageInput} className="rte-hidden-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void sendFile(file, 'gorsel'); event.target.value = ''; }} />
        <input ref={fileInput} className="rte-hidden-input" type="file" accept={FILE_ACCEPT} onChange={event => { const file = event.target.files?.[0]; if (file) void sendFile(file, 'dosya'); event.target.value = ''; }} />

        {linkOpen && (
          <Modal title="Bağlantı" onClose={() => setLinkOpen(false)}>
            <label>Adres<input value={linkUrl} onChange={event => setLinkUrl(event.target.value)} /></label>
            <label>Metin<input value={linkText} onChange={event => setLinkText(event.target.value)} placeholder="Seçili metin kullanılır" /></label>
            <div className="rte-modal-actions">
              <button type="button" className="gorev-btn gorev-btn-ghost" onClick={() => { editor?.chain().focus().unsetLink().run(); setLinkOpen(false); }}>Kaldır</button>
              <button type="button" className="gorev-btn gorev-btn-primary" onClick={applyLink}>Uygula</button>
            </div>
          </Modal>
        )}

        {findOpen && (
          <Modal title="Bul ve değiştir" onClose={() => setFindOpen(false)}>
            <label>Bul<input value={findQuery} onChange={event => { setFindQuery(event.target.value); setFindIndex(0); }} /></label>
            <label>Değiştir<input value={replaceQuery} onChange={event => setReplaceQuery(event.target.value)} /></label>
            <div className="rte-modal-actions">
              <button type="button" className="gorev-btn gorev-btn-ghost" onClick={() => jumpFind(false)}>Önceki</button>
              <button type="button" className="gorev-btn gorev-btn-ghost" onClick={() => jumpFind(true)}>Sonraki</button>
              <button type="button" className="gorev-btn gorev-btn-ghost" onClick={replaceOne}>Değiştir</button>
              <button type="button" className="gorev-btn gorev-btn-primary" onClick={replaceAll}>Tümü</button>
            </div>
          </Modal>
        )}

        {mathOpen && (
          <Modal title="Denklem" onClose={() => setMathOpen(null)}>
            <div className="rte-math-snippets">
              {MATH_SNIPPETS.map(item => (
                <button type="button" key={item.label} onClick={() => setMathOpen(prev => prev ? { ...prev, latex: item.latex } : prev)}>{item.label}</button>
              ))}
            </div>
            <label>LaTeX
              <textarea rows={3} value={mathOpen.latex} onChange={event => setMathOpen(prev => prev ? { ...prev, latex: event.target.value } : prev)} />
            </label>
            <label className="rte-check"><input type="checkbox" checked={mathOpen.display} onChange={event => setMathOpen(prev => prev ? { ...prev, display: event.target.checked } : prev)} /> Ayrı satırda göster</label>
            <div className="rte-math-preview" dangerouslySetInnerHTML={{ __html: katex.renderToString(mathOpen.latex || '\\,', { throwOnError: false, displayMode: mathOpen.display }) }} />
            <div className="rte-modal-actions">
              <button type="button" className="gorev-btn gorev-btn-ghost" onClick={() => setMathOpen(null)}>Vazgeç</button>
              <button type="button" className="gorev-btn gorev-btn-primary" onClick={applyMath}>Ekle</button>
            </div>
          </Modal>
        )}

        {helpOpen && (
          <Modal title="Klavye kısayolları" onClose={() => setHelpOpen(false)}>
            <ul className="rte-shortcuts">
              {SHORTCUTS.map(([key, label]) => <li key={key}><kbd>{key}</kbd><span>{label}</span></li>)}
            </ul>
          </Modal>
        )}

        {confirm && (
          <Modal title="Onay" onClose={confirm.no}>
            <p>{confirm.message}</p>
            <div className="rte-modal-actions">
              <button type="button" className="gorev-btn gorev-btn-ghost" onClick={confirm.no}>{confirm.noLabel}</button>
              <button type="button" className="gorev-btn gorev-btn-primary" onClick={confirm.yes}>{confirm.yesLabel}</button>
            </div>
          </Modal>
        )}
      </div>
    );
  },
);

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="rte-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="rte-modal" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
        <header><strong>{title}</strong><button type="button" onClick={onClose} aria-label="Kapat">×</button></header>
        {children}
      </div>
    </div>
  );
}

function Preview({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.innerHTML = html;
    root.querySelectorAll<HTMLElement>('[data-latex]').forEach(el => {
      const latex = el.getAttribute('data-latex') || '';
      const display = el.getAttribute('data-type') === 'mathBlock';
      try {
        katex.render(latex, el, { throwOnError: false, displayMode: display });
      } catch {
        el.textContent = latex;
      }
    });
  }, [html]);
  return <div ref={ref} className="rte-preview gorev-rich-view" aria-label="Önizleme" />;
}

export default GorevRichTextEditor;
