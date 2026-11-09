import { useCallback, useEffect, useRef, useState } from "react";
import type { SozlesmeFormData } from "../types";
import { saveTaslak } from "../services/api";

export function useSozlesmeForm(
  form: SozlesmeFormData,
  options: {
    isEdit: boolean;
    sozlesmeId?: number;
    buildPayload: (durum?: string) => SozlesmeFormData;
  },
) {
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [retry, setRetry] = useState(0);
  const initialRef = useRef("");
  const pending = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ form: JSON.stringify(form), options });
  latest.current = { form: JSON.stringify(form), options };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const markClean = useCallback((snapshot: SozlesmeFormData) => {
    initialRef.current = JSON.stringify(snapshot);
    setDirty(false);
    setSaveState("saved");
    setSaveError("");
  }, []);

  const patchWithDirty = useCallback(
    (patch: Partial<SozlesmeFormData>, apply: (p: Partial<SozlesmeFormData>) => void) => {
      apply(patch);
      setDirty(true);
    }, [],
  );

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!options.isEdit || !options.sozlesmeId || !dirty) return;
    const timer = setTimeout(async () => {
      if (pending.current) return;
      pending.current = true;
      const snapshot = latest.current.form;
      const id = latest.current.options.sozlesmeId!;
      setSaveState("saving");
      setSaveError("");
      try {
        // Taslak ucu alanları kaydeder; sözleşmenin durumu değişmez.
        const result = await saveTaslak(id, latest.current.options.buildPayload());
        if (!mounted.current || id !== latest.current.options.sozlesmeId) return;
        if (!result.success) throw new Error(result.error || "Değişiklikler kaydedilemedi.");
        if (snapshot === latest.current.form) {
          initialRef.current = snapshot;
          setDirty(false);
          setSaveState("saved");
        }
      } catch (error) {
        if (mounted.current && id === latest.current.options.sozlesmeId) {
          setSaveState("error");
          setSaveError(error instanceof Error ? error.message : "Değişiklikler kaydedilemedi.");
        }
      } finally {
        pending.current = false;
        if (mounted.current && id === latest.current.options.sozlesmeId && snapshot !== latest.current.form) {
          setRetry(value => value + 1);
        }
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [dirty, form, options.isEdit, options.sozlesmeId, retry]);

  const retrySave = useCallback(() => setRetry(value => value + 1), []);
  return { dirty, setDirty, markClean, patchWithDirty, saveState, saveError, retrySave };
}
