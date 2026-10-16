'use client';

import React, { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import katex from 'katex';
import GorevImageLightbox from '@/components/gorev/GorevImageLightbox';
import { formatBytes } from './html';

export function GorevImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const attrsRef = useRef(node.attrs);
  attrsRef.current = node.attrs;
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [zoom, setZoom] = useState(false);
  const [draggingAlign, setDraggingAlign] = useState<'left' | 'center' | 'right' | null>(null);

  const alignFromPointer = (clientX: number, editor: HTMLElement | null): 'left' | 'center' | 'right' => {
    if (!editor) return 'center';
    const box = editor.getBoundingClientRect();
    const ratio = box.width ? (clientX - box.left) / box.width : 0.5;
    if (ratio < 0.34) return 'left';
    if (ratio > 0.66) return 'right';
    return 'center';
  };

  const applyAlign = (align: 'left' | 'center' | 'right') => {
    const width = String(attrsRef.current.width || '');
    updateAttributes({
      align,
      width: align !== 'center' && (!width || width === '100%') ? '45%' : width,
    });
  };

  const onImagePointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const editor = event.currentTarget.closest('.ProseMirror') as HTMLElement | null;
    let moved = false;
    let last: 'left' | 'center' | 'right' | null = null;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
      moved = true;
      ev.preventDefault();
      const next = alignFromPointer(ev.clientX, editor);
      setDraggingAlign(next);
      if (next !== last) {
        last = next;
        applyAlign(next);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDraggingAlign(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const width = imgRef.current?.getBoundingClientRect().width || 240;
    drag.current = { x: event.clientX, width };
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      const next = Math.max(96, Math.round(drag.current.width + (ev.clientX - drag.current.x)));
      updateAttributes({ width: `${next}px` });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <NodeViewWrapper
      className={`gorev-image-wrap${selected ? ' is-selected' : ''}${draggingAlign ? ' is-dragging' : ''}`}
      data-align={draggingAlign || node.attrs.align || 'center'}
    >
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        title="Sola, ortaya veya sağa sürükleyin"
        style={{ width: node.attrs.width || '100%' }}
        draggable={false}
        onPointerDown={onImagePointerDown}
      />
      {draggingAlign ? (
        <span className="gorev-align-guide" aria-hidden>
          <span className={draggingAlign === 'left' ? 'is-on' : ''}>Sol</span>
          <span className={draggingAlign === 'center' ? 'is-on' : ''}>Orta</span>
          <span className={draggingAlign === 'right' ? 'is-on' : ''}>Sağ</span>
        </span>
      ) : null}
      <button
        type="button"
        className="gorev-image-zoom"
        aria-label="Görseli büyüt"
        onMouseDown={event => event.preventDefault()}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          setZoom(true);
        }}
      >
        Büyüt
      </button>
      {selected && (
        <button type="button" className="gorev-image-handle" aria-label="Görseli boyutlandır" onPointerDown={onPointerDown} />
      )}
      {zoom && node.attrs.src ? (
        <GorevImageLightbox src={node.attrs.src} alt={node.attrs.alt || ''} onClose={() => setZoom(false)} />
      ) : null}
    </NodeViewWrapper>
  );
}

export function GorevFileView({ node, deleteNode, selected }: NodeViewProps) {
  const size = Number(node.attrs.size || 0);
  return (
    <NodeViewWrapper className={`gorev-file-card${selected ? ' is-selected' : ''}`} data-dosya-id={node.attrs.dosyaId}>
      <span className="gorev-file-icon" aria-hidden>📄</span>
      <span className="gorev-file-meta">
        <a href={node.attrs.href} target="_blank" rel="noopener noreferrer">{node.attrs.name || 'Dosya'}</a>
        <small>{node.attrs.mime || 'Ek dosya'}{size ? ` · ${formatBytes(size)}` : ''}</small>
      </span>
      <a className="gorev-file-open" href={node.attrs.href} target="_blank" rel="noopener noreferrer">Aç</a>
      <button type="button" className="rte-btn" onClick={deleteNode} aria-label="Eki kaldır">×</button>
    </NodeViewWrapper>
  );
}

export function MathView({ node, editor, getPos, selected }: NodeViewProps) {
  const ref = useRef<HTMLElement>(null);
  const block = node.type.name === 'mathBlock';

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(node.attrs.latex || '', ref.current, { throwOnError: false, displayMode: block });
    } catch {
      ref.current.textContent = node.attrs.latex || '';
    }
  }, [node.attrs.latex, block]);

  const edit = () => {
    const pos = getPos();
    const ui = (editor.storage as { gorevUi?: { openMath?: (payload: unknown) => void } }).gorevUi;
    if (typeof pos === 'number') {
      ui?.openMath?.({ latex: node.attrs.latex || '', pos, kind: node.type.name });
    }
  };

  return (
    <NodeViewWrapper
      as={block ? 'div' : 'span'}
      className={`${block ? 'gorev-math-block' : 'gorev-math-inline'}${selected ? ' is-selected' : ''}`}
      onDoubleClick={edit}
    >
      <span ref={ref as React.RefObject<HTMLSpanElement>} />
    </NodeViewWrapper>
  );
}
