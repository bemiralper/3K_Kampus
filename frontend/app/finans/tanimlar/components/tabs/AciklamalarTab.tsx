"use client";

import React, { useEffect, useState } from "react";
import { financialAccountService } from "../../../services/finans-api";

interface Props {
  maliHesapId: number;
  aciklama: string;
  onToast: (msg: string, type?: "success" | "error" | "info") => void;
  onSaved: (aciklama: string) => void;
}

export default function AciklamalarTab({ maliHesapId, aciklama, onToast, onSaved }: Props) {
  const [value, setValue] = useState(aciklama || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(aciklama || ""); }, [aciklama, maliHesapId]);

  const dirty = value !== (aciklama || "");

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await financialAccountService.update(maliHesapId, { aciklama: value.trim() });
      onToast("Açıklama kaydedildi");
      onSaved(updated.aciklama || "");
    } catch (err: any) {
      onToast(err.message || "Açıklama kaydedilemedi", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
        Bu mali hesap için notlar / açıklamalar
      </label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Bu hesapla ilgili notlarınızı buraya yazabilirsiniz (örn: kullanım amacı, özel talimatlar, hatırlatmalar)..."
        maxLength={2000}
        className="w-full min-h-[220px] px-4 py-3.5 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-y placeholder:text-gray-400"
      />
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-400">{value.length}/2000</span>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
