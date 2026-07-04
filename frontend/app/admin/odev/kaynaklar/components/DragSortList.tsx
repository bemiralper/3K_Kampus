// ========== Drag-and-Drop Sortable List ==========
"use client";
import React, { useRef, useState } from "react";

interface DragSortListProps<T extends { id: number }> {
  items: T[];
  onReorder: (orderedIds: number[]) => void;
  renderItem: (item: T, dragHandleProps: DragHandleProps) => React.ReactNode;
}

export interface DragHandleProps {
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  style: React.CSSProperties;
}

export function DragSortList<T extends { id: number }>({ items, onReorder, renderItem }: DragSortListProps<T>) {
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    dragItem.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      const sorted = [...items];
      const [removed] = sorted.splice(dragItem.current, 1);
      sorted.splice(dragOverItem.current, 0, removed);
      onReorder(sorted.map(i => i.id));
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    dragOverItem.current = index;
    setOverIndex(index);
  };

  const handleDrop = () => (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <>
      {items.map((item, index) => {
        const isDragging = dragIndex === index;
        const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;

        const dragHandleProps: DragHandleProps = {
          draggable: true,
          onDragStart: handleDragStart(index),
          onDragEnd: handleDragEnd,
          onDragOver: handleDragOver(index),
          onDrop: handleDrop(),
          style: {
            opacity: isDragging ? 0.4 : 1,
            borderTop: isOver ? "3px solid #667eea" : "none",
            transition: "opacity 0.2s, border-top 0.2s",
          },
        };

        return <React.Fragment key={item.id}>{renderItem(item, dragHandleProps)}</React.Fragment>;
      })}
    </>
  );
}

// Drag handle icon
export function DragHandle() {
  return (
    <span
      style={{
        cursor: "grab",
        fontSize: 14,
        color: "#94a3b8",
        userSelect: "none",
        padding: "2px 4px",
        display: "inline-flex",
        alignItems: "center",
      }}
      title="Sürükle-bırak ile sırala"
    >
      ⠿
    </span>
  );
}
