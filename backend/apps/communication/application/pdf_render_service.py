"""
Server-side PDF üretimi — makbuz ve basit metin raporları.
"""
from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)


class PdfRenderService:
    """Reportlab tabanlı minimal PDF servisi."""

    @classmethod
    def render_makbuz_pdf(cls, tahsilat_id: int) -> bytes:
        data = cls._build_makbuz_data(tahsilat_id)
        if not data:
            raise ValueError('Tahsilat bulunamadı.')

        lines = [
            f"Makbuz No: {data.get('makbuz_no', '')}",
            f"Tarih: {data.get('tahsilat_tarihi', '')}",
            f"Tutar: {data.get('tutar', 0):,} TL".replace(',', '.'),
        ]
        ogrenci = data.get('ogrenci') or {}
        if ogrenci:
            lines.append(f"Öğrenci: {ogrenci.get('ad', '')} {ogrenci.get('soyad', '')}".strip())
        veli = data.get('veli') or {}
        if veli:
            lines.append(f"Veli: {veli.get('ad', '')} {veli.get('soyad', '')}".strip())
        kurum = data.get('kurum') or {}
        if kurum:
            lines.append(f"Kurum: {kurum.get('ad', '')}")

        if data.get('dagitim_detay'):
            lines.append('')
            lines.append('Dağıtım:')
            for d in data['dagitim_detay']:
                lines.append(
                    f"  Taksit {d.get('taksit_no')}: {d.get('tutar', 0):,} TL".replace(',', '.')
                )

        return cls.render_simple_text_pdf('Tahsilat Makbuzu', '\n'.join(lines))

    @classmethod
    def render_simple_text_pdf(cls, title: str, body: str) -> bytes:
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import cm
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
        except ImportError as exc:
            raise RuntimeError('PDF kütüphanesi (reportlab) yüklü değil.') from exc

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'Title',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=12,
        )
        body_style = ParagraphStyle(
            'Body',
            parent=styles['Normal'],
            fontSize=11,
            leading=14,
        )

        story = [
            Paragraph(cls._escape_xml(title), title_style),
            Spacer(1, 0.5 * cm),
        ]
        for line in (body or '').split('\n'):
            if line.strip():
                story.append(Paragraph(cls._escape_xml(line), body_style))
            else:
                story.append(Spacer(1, 0.2 * cm))

        doc.build(story)
        return buf.getvalue()

    @classmethod
    def _build_makbuz_data(cls, tahsilat_id: int) -> dict | None:
        from apps.odeme_takip.domain.models import Tahsilat, TahsilatDagitim

        try:
            th = Tahsilat.objects.select_related(
                'sozlesme', 'sozlesme__ogrenci', 'sozlesme__kurum',
                'sozlesme__sube', 'sozlesme__veli', 'sozlesme__egitim_yili',
                'taksit', 'odeme_yontemi', 'islem_yapan',
            ).get(id=tahsilat_id)
        except Tahsilat.DoesNotExist:
            return None

        sz = th.sozlesme
        kurum = sz.kurum if sz else None
        ogrenci = sz.ogrenci if sz else None
        veli = sz.veli if sz else None

        dagitim_detay = []
        for dag in TahsilatDagitim.objects.filter(tahsilat=th).select_related('taksit'):
            dagitim_detay.append({
                'taksit_no': dag.taksit.taksit_no,
                'tutar': int(round(float(dag.tutar or 0))),
                'vade_tarihi': str(dag.taksit.vade_tarihi) if dag.taksit.vade_tarihi else None,
            })

        return {
            'makbuz_no': f'MKB-{th.id:06d}',
            'tahsilat_id': th.id,
            'tahsilat_tarihi': str(th.tahsilat_tarihi) if th.tahsilat_tarihi else None,
            'tutar': int(round(float(th.tutar or 0))),
            'ogrenci': {
                'ad': ogrenci.ad if ogrenci else '',
                'soyad': ogrenci.soyad if ogrenci else '',
            } if ogrenci else None,
            'veli': {
                'ad': veli.ad if veli else '',
                'soyad': veli.soyad if veli else '',
            } if veli else None,
            'kurum': {
                'ad': kurum.ad if kurum else '',
            } if kurum else None,
            'dagitim_detay': dagitim_detay,
        }

    @staticmethod
    def _escape_xml(text: str) -> str:
        return (
            str(text)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
        )
