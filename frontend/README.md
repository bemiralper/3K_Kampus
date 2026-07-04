# 3K Kampüs LMS - Frontend

## Kurulum

```bash
cd frontend
npm install
```

## Çalıştırma

```bash
npm run dev
```

## Ortam Değişkenleri

- `NEXT_PUBLIC_API_BASE_URL`: Backend wizard API base URL (ör. `http://localhost:8000/api/ogrenci-kayit`)
- `NEXT_PUBLIC_BACKEND_URL`: Legacy sayfalar için backend base URL (ör. `http://localhost:8000`)

## Legacy Şablonlar

- Django `templates/` dosyaları `frontend/legacy-templates/` altına taşındı.
- Sayfalar Next.js içinde static olarak render edilir; dinamik veri alanları şimdilik yer tutucudur.
- Statik dosyalar `frontend/public/css` ve `frontend/public/img` altında bulunur.
