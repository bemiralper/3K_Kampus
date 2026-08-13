"use client";

import type { ReactNode } from "react";
import CoachActionSheet from "@/components/coach/CoachActionSheet";

type CoachFilterSheetProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export default function CoachFilterSheet({
  open,
  title = "Filtreler",
  onClose,
  children,
  footer,
}: CoachFilterSheetProps) {
  if (!open) return null;

  return (
    <CoachActionSheet title={title} onClose={onClose} footer={footer}>
      <div className="coach-filter-sheet-body">{children}</div>
    </CoachActionSheet>
  );
}
