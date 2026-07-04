"""
Görüşme Kayıtları Serializers
"""
from rest_framework import serializers
from apps.coaching.models import (
    GorusmeKaydi, GorusmeAksiyon, GorusmeKatilimci,
    GorusmeDosya, GorusmeHatirlatma,
)


# ═══════════════════════════════════════════════════════════════
# ALT MODEL SERIALIZERS
# ═══════════════════════════════════════════════════════════════

class GorusmeAksiyonSerializer(serializers.ModelSerializer):
    sorumlu_display = serializers.CharField(
        source='get_sorumlu_display', read_only=True
    )

    class Meta:
        model = GorusmeAksiyon
        fields = [
            'id', 'gorusme', 'aciklama', 'sorumlu', 'sorumlu_display',
            'deadline', 'tamamlandi', 'tamamlanma_tarihi', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class GorusmeAksiyonCreateSerializer(serializers.Serializer):
    aciklama = serializers.CharField(max_length=500)
    sorumlu = serializers.ChoiceField(
        choices=GorusmeAksiyon.SORUMLU_CHOICES, default='ogrenci'
    )
    deadline = serializers.DateField(required=False, allow_null=True)


class GorusmeKatilimciSerializer(serializers.ModelSerializer):
    rol_display = serializers.CharField(
        source='get_rol_display', read_only=True
    )

    class Meta:
        model = GorusmeKatilimci
        fields = ['id', 'gorusme', 'ad_soyad', 'rol', 'rol_display', 'personel']
        read_only_fields = ['id']


class GorusmeDosyaSerializer(serializers.ModelSerializer):
    class Meta:
        model = GorusmeDosya
        fields = ['id', 'gorusme', 'dosya', 'aciklama', 'created_at']
        read_only_fields = ['id', 'created_at']


class GorusmeHatirlatmaSerializer(serializers.ModelSerializer):
    tip_display = serializers.CharField(
        source='get_tip_display', read_only=True
    )

    class Meta:
        model = GorusmeHatirlatma
        fields = [
            'id', 'gorusme', 'hatirlatma_tarihi', 'mesaj',
            'tip', 'tip_display', 'gonderildi', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class GorusmeHatirlatmaCreateSerializer(serializers.Serializer):
    hatirlatma_tarihi = serializers.DateField()
    mesaj = serializers.CharField(max_length=500)
    tip = serializers.ChoiceField(
        choices=GorusmeHatirlatma.TIP_CHOICES, default='genel'
    )


# ═══════════════════════════════════════════════════════════════
# GÖRÜŞME KAYDI SERIALIZERS
# ═══════════════════════════════════════════════════════════════

class GorusmeKaydiListSerializer(serializers.ModelSerializer):
    """Liste görünümü — hafif, tablo için"""

    ogrenci_adi = serializers.SerializerMethodField()
    koc_adi = serializers.SerializerMethodField()
    gorusme_turu_display = serializers.CharField(
        source='get_gorusme_turu_display', read_only=True
    )
    durum_display = serializers.CharField(
        source='get_durum_display', read_only=True
    )
    yontem_display = serializers.CharField(
        source='get_yontem_display', read_only=True
    )
    oncelik_display = serializers.CharField(
        source='get_oncelik_display', read_only=True
    )
    aksiyon_sayisi = serializers.SerializerMethodField()
    tamamlanan_aksiyon = serializers.SerializerMethodField()

    class Meta:
        model = GorusmeKaydi
        fields = [
            'id',
            'ogrenci', 'ogrenci_adi',
            'koc', 'koc_adi',
            'gorusme_turu', 'gorusme_turu_display',
            'diger_tur_aciklama',
            'durum', 'durum_display',
            'yontem', 'yontem_display',
            'oncelik', 'oncelik_display',
            'gorusme_tarihi', 'gorusme_saati', 'sure_dakika',
            'konu',
            'motivasyon_skoru', 'akademik_ozguven_skoru', 'stres_seviyesi',
            'etiketler',
            'veli_ile_paylasilsin',
            'sonraki_gorusme_tarihi',
            'aksiyon_sayisi', 'tamamlanan_aksiyon',
            'created_at',
        ]

    def get_ogrenci_adi(self, obj):
        return f"{obj.ogrenci.ad} {obj.ogrenci.soyad}"

    def get_koc_adi(self, obj):
        return f"{obj.koc.teacher.ad} {obj.koc.teacher.soyad}"

    def get_aksiyon_sayisi(self, obj):
        return obj.aksiyonlar.count()

    def get_tamamlanan_aksiyon(self, obj):
        return obj.aksiyonlar.filter(tamamlandi=True).count()


class GorusmeKaydiDetailSerializer(GorusmeKaydiListSerializer):
    """Detay görünümü — aksiyonlar, katılımcılar, hatırlatmalar dahil"""

    aksiyonlar = GorusmeAksiyonSerializer(many=True, read_only=True)
    katilimcilar = GorusmeKatilimciSerializer(many=True, read_only=True)
    hatirlatmalar = GorusmeHatirlatmaSerializer(many=True, read_only=True)
    dosyalar = GorusmeDosyaSerializer(many=True, read_only=True)
    olusturan_adi = serializers.SerializerMethodField()

    class Meta(GorusmeKaydiListSerializer.Meta):
        fields = GorusmeKaydiListSerializer.Meta.fields + [
            'notlar',
            'veli_ozet',
            'veli_paylasim_tarihi',
            'aksiyonlar',
            'katilimcilar',
            'hatirlatmalar',
            'dosyalar',
            'olusturan_adi',
            'updated_at',
        ]

    def get_olusturan_adi(self, obj):
        if obj.olusturan:
            return f"{obj.olusturan.first_name} {obj.olusturan.last_name}".strip() or obj.olusturan.username
        return None


class GorusmeKaydiCreateSerializer(serializers.Serializer):
    """Oluşturma / Güncelleme"""

    kurum_id = serializers.IntegerField()
    ogrenci_id = serializers.IntegerField()
    koc_id = serializers.IntegerField()
    gorusme_turu = serializers.ChoiceField(choices=GorusmeKaydi.GORUSME_TURU_CHOICES)
    diger_tur_aciklama = serializers.CharField(max_length=100, required=False, default='', allow_blank=True)
    durum = serializers.ChoiceField(
        choices=GorusmeKaydi.DURUM_CHOICES, default='planlandi'
    )
    yontem = serializers.ChoiceField(
        choices=GorusmeKaydi.YONTEM_CHOICES, default='yuz_yuze'
    )
    oncelik = serializers.ChoiceField(
        choices=GorusmeKaydi.ONCELIK_CHOICES, default='normal'
    )
    gorusme_tarihi = serializers.DateField()
    gorusme_saati = serializers.TimeField(required=False, allow_null=True)
    sure_dakika = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    konu = serializers.CharField(max_length=500)
    notlar = serializers.CharField(required=False, default='', allow_blank=True)

    # Duygu skorları
    motivasyon_skoru = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=5
    )
    akademik_ozguven_skoru = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=5
    )
    stres_seviyesi = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=5
    )

    # Etiketler
    etiketler = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False, default=list,
    )

    # Veli paylaşım
    veli_ile_paylasilsin = serializers.BooleanField(default=False)
    veli_ozet = serializers.CharField(required=False, default='', allow_blank=True)

    # WhatsApp hatırlatma (varsayılan açık — geriye uyumlu)
    send_whatsapp_reminder = serializers.BooleanField(default=True, required=False)

    # Sonraki görüşme
    sonraki_gorusme_tarihi = serializers.DateField(required=False, allow_null=True)

    # İç içe veriler (oluşturma sırasında opsiyonel)
    aksiyonlar = GorusmeAksiyonCreateSerializer(many=True, required=False, default=list)
    hatirlatmalar = GorusmeHatirlatmaCreateSerializer(many=True, required=False, default=list)


class GorusmeDurumGuncelleSerializer(serializers.Serializer):
    durum = serializers.ChoiceField(choices=GorusmeKaydi.DURUM_CHOICES)


class GorusmeOzetSerializer(serializers.Serializer):
    """Özet istatistikler"""
    toplam = serializers.IntegerField()
    planlanan = serializers.IntegerField()
    tamamlanan = serializers.IntegerField()
    iptal = serializers.IntegerField()
    ertelenen = serializers.IntegerField()
    bu_hafta = serializers.IntegerField()
