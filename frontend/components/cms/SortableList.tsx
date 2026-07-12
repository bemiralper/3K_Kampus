'use client';

import { type ReactNode, useCallback, useRef, useState } from 'react';

type SortableListProps<T> = {
  items: T[];
  getKey: (item: T) => string | number;
  onChange: (items: T[]) => void;
  onReorderComplete?: (items: T[]) => void;
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
  emptyMessage?: string;
  className?: string;
};

const Handle = ({
  onDragStart,
  onDragEnd,
}: {
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) => (
  <span
    className="cms-sortable-handle"
    draggable
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    title="Sürükleyerek sıralayın"
    aria-hidden
  >
    ⠿
  </span>
);

export default function SortableList<T>({
  items,
  getKey,
  onChange,
  onReorderComplete,
  renderItem,
  emptyMessage,
  className,
}: SortableListProps<T>) {
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const endDrag = useCallback(() => {
    dragIndex.current = null;
    setOverIndex(null);
    setDragging(false);
  }, []);

  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange(next);
      onReorderComplete?.(next);
    },
    [items, onChange, onReorderComplete],
  );

  if (items.length === 0 && emptyMessage) {
    return <div className="wam-empty">{emptyMessage}</div>;
  }

  return (
    <ul className={`cms-sortable-list ${className ?? ''}`}>
      {items.map((item, index) => {
        const startDrag = (e: React.DragEvent) => {
          dragIndex.current = index;
          setDragging(true);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
          if (e.dataTransfer.setDragImage && e.currentTarget instanceof HTMLElement) {
            const row = e.currentTarget.closest('.cms-sortable-item') as HTMLElement | null;
            if (row) e.dataTransfer.setDragImage(row, 24, 20);
          }
        };

        const onHandleDragEnd = () => endDrag();

        return (
          <li
            key={getKey(item)}
            className={[
              'cms-sortable-item',
              dragging && dragIndex.current === index ? 'is-dragging' : '',
              overIndex === index && dragIndex.current !== index ? 'is-over' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((prev) => (prev === index ? null : prev))}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragIndex.current ?? Number(e.dataTransfer.getData('text/plain'));
              reorder(from, index);
              endDrag();
            }}
          >
            {renderItem(item, index, (
              <Handle onDragStart={startDrag} onDragEnd={onHandleDragEnd} />
            ))}
          </li>
        );
      })}
    </ul>
  );
}
