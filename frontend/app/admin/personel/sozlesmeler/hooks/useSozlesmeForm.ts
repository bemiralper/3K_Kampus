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
  const initialRef = useRef<string>("");
  const autosavingRef = useRef(false);

  const markClean = useCallback((snapshot: SozlesmeFormData) => {
    initialRef.current = JSON.stringify(snapshot);
    setDirty(false);
  }, []);

  const patchWithDirty = useCallback(
    (patch: Partial<SozlesmeFormData>, apply: (p: Partial<SozlesmeFormData>) => void) => {
      apply(patch);
      setDirty(true);
    },
    [],
  );

  useEffect(() => {
    if (!initialRef.current && form.personel_id) {
      initialRef.current = JSON.stringify(form);
    }
  }, [form]);

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
      if (autosavingRef.current) return;
      autosavingRef.current = true;
      try {
        await saveTaslak(options.sozlesmeId!, options.buildPayload("TASLAK"));
        setDirty(false);
      } finally {
        autosavingRef.current = false;
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [dirty, form, options]);

  return { dirty, setDirty, markClean, patchWithDirty };
}
