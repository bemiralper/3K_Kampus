'use client';

import { useRef, useState } from 'react';

type ImageUploadFieldProps = {
  label: string;
  sizeHint: string;
  detailHint: string;
  maxMb?: number;
  currentUrl?: string | null;
  onUpload: (file: File) => Promise<void>;
  accept?: string;
};

export default function ImageUploadField({
  label,
  sizeHint,
  detailHint,
  maxMb = 5,
  currentUrl,
  onUpload,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setError('');
    if (file.size > maxMb * 1024 * 1024) {
      setError(`Dosya en fazla ${maxMb} MB olabilir.`);
      return;
    }
    setUploading(true);
    try {
      await onUpload(file);
    } catch {
      setError('Yükleme başarısız.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="wam-image-upload">
      <div className="wam-image-upload-head">
        <strong>{label}</strong>
        <span className="wam-image-size-badge">Önerilen: {sizeHint} · Maks. {maxMb} MB</span>
      </div>
      <p className="wam-image-hint">{detailHint}</p>
      <div className="wam-image-upload-body">
        <div className={`wam-image-preview ${currentUrl ? 'has-image' : ''}`}>
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt={label} />
          ) : (
            <span className="wam-image-placeholder">Görsel yok</span>
          )}
        </div>
        <div className="wam-image-actions">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Yükleniyor…' : currentUrl ? 'Görseli Değiştir' : 'Görsel Yükle'}
          </button>
        </div>
      </div>
      {error && <p className="wam-image-error">{error}</p>}
    </div>
  );
}
