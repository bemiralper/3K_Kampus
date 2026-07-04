"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const DEFAULT_MESSAGE =
  "Bu sayfadan ayrılmak istediğinize emin misiniz? Kaydedilmemiş değişiklikler kaybolabilir.";

type PendingNavigation = {
  kind: "href" | "action";
  href?: string;
  action?: () => void;
};

function isLeavingCurrentPage(href: string, pathname: string): boolean {
  if (!href || href.startsWith("#")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
    return false;
  }

  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return true;
    return url.pathname !== pathname;
  } catch {
    return href.startsWith("/") && href !== pathname;
  }
}

export interface UseUnsavedChangesGuardOptions {
  isDirty: boolean;
  message?: string;
  title?: string;
  enabled?: boolean;
}

export interface LeaveDialogProps {
  open: boolean;
  title?: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function useUnsavedChangesGuard({
  isDirty,
  message = DEFAULT_MESSAGE,
  title,
  enabled = true,
}: UseUnsavedChangesGuardOptions) {
  const pathname = usePathname();
  const router = useRouter();
  const bypassRef = useRef(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);

  const active = enabled && isDirty && !bypassRef.current;

  const markClean = useCallback(() => {
    bypassRef.current = true;
  }, []);

  const resetBypass = useCallback(() => {
    bypassRef.current = false;
  }, []);

  const executeNavigation = useCallback(
    (navigation: PendingNavigation) => {
      bypassRef.current = true;
      setPendingNavigation(null);
      if (navigation.kind === "href" && navigation.href) {
        router.push(navigation.href);
        return;
      }
      navigation.action?.();
    },
    [router]
  );

  const requestNavigation = useCallback(
    (target: string | (() => void)) => {
      if (!enabled || !isDirty || bypassRef.current) {
        if (typeof target === "string") {
          router.push(target);
        } else {
          target();
        }
        return;
      }

      if (typeof target === "string") {
        if (!isLeavingCurrentPage(target, pathname)) {
          router.push(target);
          return;
        }
        setPendingNavigation({ kind: "href", href: target });
        return;
      }

      setPendingNavigation({ kind: "action", action: target });
    },
    [enabled, isDirty, pathname, router]
  );

  const cancelNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  useEffect(() => {
    if (!active) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const handlePopState = () => {
      window.history.pushState({ unsavedGuard: true }, "");
      setPendingNavigation({
        kind: "action",
        action: () => {
          bypassRef.current = true;
          window.history.back();
        },
      });
    };

    window.history.pushState({ unsavedGuard: true }, "");
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank") return;

      const href = anchor.getAttribute("href");
      if (!href || !isLeavingCurrentPage(href, pathname)) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation({ kind: "href", href });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [active, pathname]);

  useEffect(() => {
    if (isDirty) {
      bypassRef.current = false;
    }
  }, [isDirty]);

  const leaveDialogProps: LeaveDialogProps = {
    open: pendingNavigation !== null,
    title,
    message,
    onCancel: cancelNavigation,
    onConfirm: () => {
      if (pendingNavigation) {
        executeNavigation(pendingNavigation);
      }
    },
  };

  return {
    leaveDialogProps,
    markClean,
    resetBypass,
    requestNavigation,
  };
}
