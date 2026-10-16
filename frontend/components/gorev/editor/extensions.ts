import { mergeAttributes, Node, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import FontFamily from '@tiptap/extension-font-family';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { formatBytes } from './html';
import { GorevFileView, GorevImageView, MathView } from './node-views';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    lineSpacing: {
      setLineHeight: (value: string) => ReturnType;
      increaseIndent: () => ReturnType;
      decreaseIndent: () => ReturnType;
    };
  }
}

const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: element => element.style.fontSize || null,
          renderHTML: attributes => (attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: size => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const LineSpacing = Extension.create({
  name: 'lineSpacing',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: element => element.style.lineHeight || null,
          renderHTML: attributes => (attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {}),
        },
        indent: {
          default: 0,
          parseHTML: element => {
            const value = parseInt(element.style.marginLeft || '0', 10);
            return Number.isFinite(value) ? Math.round(value / 24) : 0;
          },
          renderHTML: attributes => (attributes.indent ? { style: `margin-left: ${attributes.indent * 24}px` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setLineHeight: value => ({ editor, commands }) => {
        const type = editor.isActive('heading') ? 'heading' : 'paragraph';
        return commands.updateAttributes(type, { lineHeight: value || null });
      },
      increaseIndent: () => ({ editor, commands }) => {
        const type = editor.isActive('heading') ? 'heading' : 'paragraph';
        const current = Number(editor.getAttributes(type).indent || 0);
        return commands.updateAttributes(type, { indent: Math.min(8, current + 1) });
      },
      decreaseIndent: () => ({ editor, commands }) => {
        const type = editor.isActive('heading') ? 'heading' : 'paragraph';
        const current = Number(editor.getAttributes(type).indent || 0);
        return commands.updateAttributes(type, { indent: Math.max(0, current - 1) });
      },
    };
  },
});

function cellStyle(attributes: { backgroundColor?: string | null; textAlign?: string | null }) {
  const parts: string[] = [];
  if (attributes.backgroundColor) parts.push(`background-color: ${attributes.backgroundColor}`);
  if (attributes.textAlign) parts.push(`text-align: ${attributes.textAlign}`);
  return parts.length ? { style: parts.join('; ') } : {};
}

const cellAttributes = {
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
    renderHTML: (attributes: { backgroundColor?: string | null; textAlign?: string | null }) => cellStyle(attributes),
  },
  textAlign: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.textAlign || null,
    renderHTML: () => ({}),
  },
};

const GorevTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes };
  },
});

const GorevTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes };
  },
});

export const GorevImage = Image.extend({
  name: 'gorevImage',
  inline: false,
  group: 'block',
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => element.getAttribute('width') || element.style.width || null,
        renderHTML: attributes => (attributes.width ? { width: attributes.width, style: `width: ${attributes.width}` } : {}),
      },
      align: {
        default: 'center',
        parseHTML: element => element.getAttribute('data-align') || 'center',
        renderHTML: attributes => ({ 'data-align': attributes.align || 'center' }),
      },
      dosyaId: {
        default: null,
        parseHTML: element => element.getAttribute('data-dosya-id'),
        renderHTML: attributes => (attributes.dosyaId ? { 'data-dosya-id': attributes.dosyaId } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(GorevImageView);
  },
});

export const GorevFile = Node.create({
  name: 'gorevFile',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      dosyaId: {
        default: null,
        parseHTML: element => element.getAttribute('data-dosya-id'),
      },
      name: {
        default: '',
        parseHTML: element => element.getAttribute('data-name') || '',
      },
      size: {
        default: 0,
        parseHTML: element => Number(element.getAttribute('data-size') || 0),
      },
      mime: {
        default: '',
        parseHTML: element => element.getAttribute('data-mime') || '',
      },
      href: {
        default: '',
        parseHTML: element => element.querySelector('a')?.getAttribute('href') || '',
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="gorev-file"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'gorev-file',
      'data-dosya-id': node.attrs.dosyaId,
      'data-name': node.attrs.name,
      'data-size': String(node.attrs.size || ''),
      'data-mime': node.attrs.mime,
      class: 'gorev-file-card',
    }),
    ['span', { class: 'gorev-file-icon', 'aria-hidden': 'true' }, '📄'],
    ['span', { class: 'gorev-file-meta' },
      ['a', {
        href: node.attrs.href,
        target: '_blank',
        rel: 'noopener noreferrer',
      }, node.attrs.name || 'Dosya'],
      ['small', {}, `${node.attrs.mime || 'Ek dosya'}${node.attrs.size ? ` · ${formatBytes(Number(node.attrs.size))}` : ''}`],
    ],
    ['a', {
      class: 'gorev-file-open',
      href: node.attrs.href,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, 'Aç'],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(GorevFileView);
  },
});

function mathNode(name: 'mathInline' | 'mathBlock', inline: boolean) {
  return Node.create({
    name,
    group: inline ? 'inline' : 'block',
    inline,
    atom: true,
    addAttributes() {
      return {
        latex: {
          default: '',
          parseHTML: element => element.getAttribute('data-latex') || '',
        },
      };
    },
    parseHTML() {
      return [{ tag: `${inline ? 'span' : 'div'}[data-type="${name}"]` }];
    },
    renderHTML({ node }) {
      return [inline ? 'span' : 'div', { 'data-type': name, 'data-latex': node.attrs.latex }];
    },
    addNodeView() {
      return ReactNodeViewRenderer(MathView);
    },
  });
}

export const MathInline = mathNode('mathInline', true);
export const MathBlock = mathNode('mathBlock', false);

export function createGorevExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Subscript,
    Superscript,
    LineSpacing,
    Link.configure({
      openOnClick: false,
      autolink: false,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    GorevImage,
    GorevFile,
    MathInline,
    MathBlock,
    Table.configure({ resizable: true, HTMLAttributes: { class: 'gorev-table' } }),
    TableRow,
    GorevTableHeader,
    GorevTableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: 'Görev açıklamasını yazın. Denklem, tablo, görsel ve dosya ekleyebilirsiniz.' }),
    CharacterCount,
  ];
}
