"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

function isNativeCameraDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPod/i.test(ua)) return true;
  if (navigator.maxTouchPoints > 1 && /Mac|iPad/i.test(ua)) return true;
  return false;
}

function isAllowedImageFile(file: File) {
  if (!file.type || file.type === "application/octet-stream") {
    return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  }
  return file.type.startsWith("image/");
}

async function fileToCropDataUrl(file: File): Promise<string> {
  const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (heic && typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      return canvas.toDataURL("image/jpeg", 0.92);
    } catch {
      throw new Error("Bu fotoğraf formatı desteklenmiyor. JPEG veya PNG kullanın.");
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

interface ProfilFotoUploadProps {
  ogrenciId: number;
  currentPhoto?: string | null;
  onSuccess: (newPhotoUrl: string | null) => void;
  variant?: "overlay" | "cell";
  studentName?: string;
}

export default function ProfilFotoUpload({
  ogrenciId,
  currentPhoto,
  onSuccess,
  variant = "overlay",
  studentName,
}: ProfilFotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);

  const openCropperForFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError("Dosya boyutu 5MB'dan büyük olamaz");
      return;
    }
    if (!isAllowedImageFile(file)) {
      setError("Sadece JPEG, PNG veya WebP formatları desteklenir");
      return;
    }
    try {
      const dataUrl = await fileToCropDataUrl(file);
      setCropImage(dataUrl);
      setCropPosition({ x: 0, y: 0 });
      setCropScale(1);
      setShowCropper(true);
      setShowOptions(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fotoğraf açılamadı");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await openCropperForFile(file);
  };

  const uploadPhoto = async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('foto', file);

      const res = await fetch(`/api/ogrenciler/api/${ogrenciId}/profil-foto/`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fotoğraf yüklenemedi");
      }

      const data = await res.json();
      onSuccess(data.profil_foto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Profil fotoğrafını silmek istediğinize emin misiniz?")) {
      return;
    }

    setIsUploading(true);
    setError(null);
    setShowOptions(false);

    try {
      const res = await fetch(`/api/ogrenciler/api/${ogrenciId}/profil-foto/`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fotoğraf silinemedi");
      }

      onSuccess(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setIsUploading(false);
    }
  };

  const startCamera = async () => {
    setError(null);
    setShowOptions(false);

    if (isNativeCameraDevice()) {
      cameraInputRef.current?.click();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Bu tarayıcı kamerayı desteklemiyor. Dosyadan seçin veya telefon kullanın.");
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      setCameraStream(stream);
      setShowCamera(true);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Kamera izni verilmedi. Tarayıcı ayarlarından izin verin.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("Kamera bulunamadı. Dosyadan seçmeyi deneyin.");
      } else {
        setError("Kamera açılamadı. HTTPS gerekli olabilir veya dosyadan seçin.");
      }
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      setError("Kamera henüz hazır değil, tekrar deneyin.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      stopCamera();
      setCropImage(dataUrl);
      setCropPosition({ x: 0, y: 0 });
      setCropScale(1);
      setShowCropper(true);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!showCamera || !cameraStream || !video) return;
    video.srcObject = cameraStream;
    const play = () => {
      video.play().catch(() => {});
    };
    if (video.readyState >= 2) play();
    else video.addEventListener("loadedmetadata", play);
    return () => {
      video.removeEventListener("loadedmetadata", play);
      video.srcObject = null;
    };
  }, [showCamera, cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  // Cropper handlers
  const handleCropMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
  }, [cropPosition]);

  const handleCropMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setCropPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  }, [isDragging, dragStart]);

  const handleCropMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleCropTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    setIsDragging(true);
    setDragStart({ x: t.clientX - cropPosition.x, y: t.clientY - cropPosition.y });
  }, [cropPosition]);

  const handleCropTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const t = e.touches[0];
    if (!t) return;
    setCropPosition({
      x: t.clientX - dragStart.x,
      y: t.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleCropWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setCropScale(prev => Math.min(3, Math.max(0.5, prev + delta)));
  }, []);

  const handleCropComplete = async () => {
    if (!cropImage || !cropCanvasRef.current || !cropImageRef.current) return;

    const canvas = cropCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const outputSize = 300; // Çıktı boyutu
    canvas.width = outputSize;
    canvas.height = outputSize;

    const img = cropImageRef.current;
    const containerSize = 280; // Önizleme alanı boyutu
    
    // Resmin container'a sığması için ölçeklendirme hesabı
    const baseScale = Math.max(containerSize / img.naturalWidth, containerSize / img.naturalHeight);
    const finalScale = baseScale * cropScale;
    
    const scaledWidth = img.naturalWidth * finalScale;
    const scaledHeight = img.naturalHeight * finalScale;
    
    // Merkez hesabı
    const centerX = containerSize / 2;
    const centerY = containerSize / 2;
    
    // Resmin sol üst köşesi (pozisyon ile birlikte)
    const drawX = centerX - (scaledWidth / 2) + cropPosition.x;
    const drawY = centerY - (scaledHeight / 2) + cropPosition.y;
    
    // Önizleme alanından çıktı boyutuna oran
    const ratio = outputSize / containerSize;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputSize, outputSize);
    ctx.drawImage(
      img,
      drawX * ratio,
      drawY * ratio,
      scaledWidth * ratio,
      scaledHeight * ratio
    );

    // Canvas'tan blob al ve yükle
    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], 'cropped_photo.jpg', { type: 'image/jpeg' });
        setShowCropper(false);
        setCropImage(null);
        await uploadPhoto(file);
      }
    }, 'image/jpeg', 0.9);
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    setCropImage(null);
    setCropPosition({ x: 0, y: 0 });
    setCropScale(1);
  };

  const isCell = variant === "cell";
  const pickFromGallery = () => {
    setShowOptions(false);
    fileInputRef.current?.click();
  };
  const pickFromCamera = () => {
    setShowOptions(false);
    startCamera();
  };

  return (
    <div className={`profil-foto-upload${isCell ? " is-cell" : ""}`}>
      {typeof document !== "undefined" && createPortal(
        <>
      {/* Cropper Modal */}
      {showCropper && cropImage && (
        <div className="cropper-modal-overlay">
          <div className="cropper-modal">
            <div className="cropper-header">
              <h3>Fotoğrafı Ayarla</h3>
              <button onClick={handleCropCancel} className="cropper-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="cropper-content">
              <div className="cropper-hint">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Sürükleyerek konumlandır, kaydırarak yakınlaştır
              </div>
              <div 
                className="cropper-area"
                onMouseDown={handleCropMouseDown}
                onMouseMove={handleCropMouseMove}
                onMouseUp={handleCropMouseUp}
                onMouseLeave={handleCropMouseUp}
                onTouchStart={handleCropTouchStart}
                onTouchMove={handleCropTouchMove}
                onTouchEnd={handleCropMouseUp}
                onWheel={handleCropWheel}
              >
                <div className="cropper-image-container">
                  <img 
                    ref={cropImageRef}
                    src={cropImage} 
                    alt="Kırpılacak resim"
                    draggable={false}
                    style={{
                      transform: `translate(${cropPosition.x}px, ${cropPosition.y}px) scale(${cropScale})`,
                      cursor: isDragging ? 'grabbing' : 'grab',
                    }}
                  />
                </div>
                <div className="cropper-overlay">
                  <div className="cropper-circle"></div>
                </div>
              </div>
              <div className="cropper-zoom-control">
                <button 
                  onClick={() => setCropScale(prev => Math.max(0.5, prev - 0.1))}
                  className="zoom-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <input 
                  type="range" 
                  min="0.5" 
                  max="3" 
                  step="0.1" 
                  value={cropScale}
                  onChange={(e) => setCropScale(parseFloat(e.target.value))}
                  className="zoom-slider"
                />
                <button 
                  onClick={() => setCropScale(prev => Math.min(3, prev + 0.1))}
                  className="zoom-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="cropper-actions">
              <button onClick={handleCropCancel} className="cropper-cancel-btn">İptal</button>
              <button onClick={handleCropComplete} className="cropper-save-btn" disabled={isUploading}>
                {isUploading ? (
                  <>
                    <div className="btn-spinner"></div>
                    Yükleniyor...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Kaydet
                  </>
                )}
              </button>
            </div>
            <canvas ref={cropCanvasRef} style={{ display: 'none' }} />
          </div>
        </div>
      )}

      {/* Kamera Modal */}
      {showCamera && (
        <div className="camera-modal-overlay">
          <div className="camera-modal">
            <div className="camera-header">
              <h3>Fotoğraf Çek</h3>
              <button onClick={stopCamera} className="camera-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="camera-view">
              <video ref={videoRef} autoPlay playsInline muted />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
            <div className="camera-actions">
              <button onClick={stopCamera} className="camera-cancel-btn">İptal</button>
              <button onClick={capturePhoto} className="camera-capture-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Çek
              </button>
            </div>
          </div>
        </div>
      )}
        </>,
        document.body
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setShowOptions(!showOptions);
        }}
        className={isCell ? "foto-cell-trigger" : "foto-edit-btn"}
        disabled={isUploading}
        title={currentPhoto ? "Fotoğrafı değiştir" : "Fotoğraf ekle"}
        aria-label={currentPhoto ? "Fotoğrafı değiştir" : "Fotoğraf ekle"}
      >
        {isCell ? (
          <span className={`foto-cell-badge${currentPhoto ? "" : " is-empty"}`}>
            {isUploading ? (
              <span className="upload-spinner" />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
          </span>
        ) : isUploading ? (
          <div className="upload-spinner"></div>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        )}
      </button>

      {showOptions && !isCell && (
        <>
          <div className="foto-options-backdrop" onClick={() => setShowOptions(false)} />
          <div className="foto-options-menu">
            <button type="button" onClick={pickFromGallery} className="foto-option-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Galeriden seç</span>
            </button>
            <button type="button" onClick={pickFromCamera} className="foto-option-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span>Kameradan çek</span>
            </button>
            {currentPhoto && (
              <button type="button" onClick={handleDelete} className="foto-option-item danger">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Fotoğrafı sil</span>
              </button>
            )}
          </div>
        </>
      )}

      {showOptions && isCell && typeof document !== "undefined" && createPortal(
        <div className="foto-sheet-overlay" onClick={() => { setShowOptions(false); setError(null); }}>
          <div className="foto-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Fotoğraf">
            <div className="foto-sheet-head">
              <div>
                <strong>Fotoğraf</strong>
                {studentName ? <p>{studentName}</p> : null}
              </div>
              <button type="button" className="foto-sheet-close" onClick={() => { setShowOptions(false); setError(null); }}>
                Kapat
              </button>
            </div>
            {error && <div className="foto-sheet-error">{error}</div>}
            <button type="button" className="foto-sheet-action" onClick={pickFromCamera}>
              Kameradan çek
            </button>
            <button type="button" className="foto-sheet-action" onClick={pickFromGallery}>
              Galeriden seç
            </button>
            {currentPhoto && (
              <button type="button" className="foto-sheet-action is-danger" onClick={handleDelete}>
                Fotoğrafı sil
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Gizli file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        onChange={handleFileSelect}
        className="foto-hidden-input"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="foto-hidden-input"
      />

      {error && !isCell && (
        <div className="foto-upload-error">
          {error}
        </div>
      )}

      <style jsx>{`
        .profil-foto-upload {
          position: absolute;
          bottom: -6px;
          right: -6px;
          z-index: 5;
        }

        .profil-foto-upload.is-cell {
          inset: auto;
          right: -6px;
          bottom: -6px;
          width: 24px;
          height: 24px;
          z-index: 4;
        }

        .foto-hidden-input {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
          opacity: 0;
        }

        .foto-cell-trigger {
          width: 24px;
          height: 24px;
          border: 0;
          padding: 0;
          border-radius: 7px;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .foto-cell-trigger:disabled {
          cursor: wait;
        }

        .foto-cell-badge {
          width: 22px;
          height: 22px;
          border-radius: 7px;
          background: #0f172a;
          color: #fff;
          border: 2px solid #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
        }

        .foto-cell-badge.is-empty {
          background: #0369a1;
        }

        .foto-edit-btn {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0061a6, #0380d4);
          border: 2px solid var(--card-bg, #fff);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          box-shadow: 0 2px 10px rgba(0, 97, 166, 0.35);
        }

        .foto-edit-btn:hover {
          transform: scale(1.08);
          box-shadow: 0 4px 14px rgba(0, 97, 166, 0.45);
        }

        .foto-edit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .upload-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .foto-options-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
        }

        .foto-options-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          min-width: 180px;
          overflow: hidden;
          z-index: 101;
          animation: fadeIn 0.15s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .foto-option-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          color: #374151;
          transition: all 0.15s;
        }

        .foto-option-item:hover {
          background: #f3f4f6;
        }

        .foto-option-item.danger {
          color: #dc2626;
        }

        .foto-option-item.danger:hover {
          background: #fef2f2;
        }

        .foto-option-item svg {
          flex-shrink: 0;
        }

        .foto-upload-error {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          background: #fee2e2;
          color: #dc2626;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          white-space: nowrap;
          z-index: 10;
        }

        /* Camera Modal */
        .camera-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 11000;
        }

        .camera-modal {
          background: white;
          border-radius: 16px;
          overflow: hidden;
          width: 90%;
          max-width: 450px;
        }

        .camera-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .camera-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }

        .camera-close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7280;
          padding: 4px;
          border-radius: 6px;
          transition: all 0.15s;
        }

        .camera-close-btn:hover {
          background: #f3f4f6;
          color: #111827;
        }

        .camera-view {
          background: #000;
          aspect-ratio: 1;
          overflow: hidden;
          position: relative;
        }

        .camera-view video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #000;
        }

        .camera-actions {
          display: flex;
          gap: 12px;
          padding: 16px 20px;
          background: #f9fafb;
        }

        .camera-cancel-btn {
          flex: 1;
          padding: 12px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.15s;
        }

        .camera-cancel-btn:hover {
          background: #f3f4f6;
        }

        .camera-capture-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          color: white;
          cursor: pointer;
          transition: all 0.15s;
        }

        .camera-capture-btn:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        /* Cropper Modal */
        .cropper-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 11000;
        }

        .cropper-modal {
          background: white;
          border-radius: 16px;
          overflow: hidden;
          width: 90%;
          max-width: 400px;
        }

        .cropper-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .cropper-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }

        .cropper-close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7280;
          padding: 4px;
          border-radius: 6px;
          transition: all 0.15s;
        }

        .cropper-close-btn:hover {
          background: #f3f4f6;
          color: #111827;
        }

        .cropper-content {
          padding: 20px;
          background: #f9fafb;
        }

        .cropper-hint {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #6b7280;
        }

        .cropper-area {
          position: relative;
          width: 280px;
          height: 280px;
          max-width: min(280px, 70vw);
          max-height: min(280px, 70vw);
          margin: 0 auto;
          border-radius: 50%;
          overflow: hidden;
          background: #1f2937;
          cursor: grab;
          isolation: isolate;
          touch-action: none;
        }

        .cropper-area:active {
          cursor: grabbing;
        }

        .cropper-image-container {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .cropper-image-container img {
          max-width: none;
          max-height: none;
          width: auto;
          height: auto;
          min-width: 100%;
          min-height: 100%;
          object-fit: cover;
          user-select: none;
          pointer-events: none;
          transition: transform 0.05s ease-out;
        }

        .cropper-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .cropper-circle {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
        }

        .cropper-zoom-control {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 16px;
        }

        .zoom-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          background: white;
          color: #374151;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .zoom-btn:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
        }

        .zoom-slider {
          width: 150px;
          height: 6px;
          border-radius: 3px;
          background: #e5e7eb;
          appearance: none;
          cursor: pointer;
        }

        .zoom-slider::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
        }

        .cropper-actions {
          display: flex;
          gap: 12px;
          padding: 16px 20px;
          border-top: 1px solid #e5e7eb;
        }

        .cropper-cancel-btn {
          flex: 1;
          padding: 12px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.15s;
        }

        .cropper-cancel-btn:hover {
          background: #f3f4f6;
        }

        .cropper-save-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          color: white;
          cursor: pointer;
          transition: all 0.15s;
        }

        .cropper-save-btn:hover:not(:disabled) {
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .cropper-save-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .btn-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
      `}</style>
      <style jsx global>{`
        .camera-modal-overlay,
        .cropper-modal-overlay {
          position: fixed !important;
          inset: 0 !important;
          z-index: 11000 !important;
        }
        .foto-sheet-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 12000;
          padding: 16px;
        }
        .foto-sheet {
          width: 100%;
          max-width: 360px;
          background: #fff;
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
        }
        .foto-sheet-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .foto-sheet-head strong {
          display: block;
          font-size: 16px;
          color: #0f172a;
        }
        .foto-sheet-head p {
          margin: 2px 0 0;
          font-size: 13px;
          color: #64748b;
        }
        .foto-sheet-close {
          border: 0;
          background: #f1f5f9;
          color: #334155;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .foto-sheet-error {
          background: #fef2f2;
          color: #b91c1c;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
          margin-bottom: 10px;
        }
        .foto-sheet-action {
          width: 100%;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #0f172a;
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 15px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          margin-bottom: 8px;
        }
        .foto-sheet-action:hover {
          background: #f1f5f9;
        }
        .foto-sheet-action.is-danger {
          color: #b91c1c;
          background: #fef2f2;
          border-color: #fecaca;
        }
        @media (min-width: 640px) {
          .foto-sheet-overlay {
            align-items: center;
          }
        }
      `}</style>
    </div>
  );
}
