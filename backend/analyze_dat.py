#!/usr/bin/env python
"""DAT dosyasindaki satir kaymasi ve kitapcik analizi."""

dat_path = '/Users/taner/Documents/3K Kampüs LMS/AYT Deneme Sınavları/3k_kampus_ulti_tyt_tg.dat'
with open(dat_path, 'r', encoding='windows-1254') as f:
    lines = f.read().strip().splitlines()

print("Toplam satir:", len(lines))
print()

# Ilk 10 satirin uzunlugunu goster
for i in range(min(10, len(lines))):
    print("Satir %3d: uzunluk=%d" % (i+1, len(lines[i])))

print()

# Satir 1 (Havva Sena) vs Satir 3 (normal) karsilastir
line1 = lines[0]
line3 = lines[2]

print("Satir 1 (HAVVA SENA):")
print("  Uzunluk: %d" % len(line1))
print("  Ilk 30:  %r" % line1[:30])
print("  30-60:   %r" % line1[30:60])
print("  60-90:   %r" % line1[60:90])
print()

print("Satir 3 (BILGE NUR):")
print("  Uzunluk: %d" % len(line3))
print("  Ilk 30:  %r" % line3[:30])
print("  30-60:   %r" % line3[30:60])
print("  60-90:   %r" % line3[60:90])
print()

# Fark: Satir 1 pozisyon 0'dan basliyor, Satir 3'te 11 bosluk var
# Demek ki Satir 1'de 11 karakter on-ek eksik
# Normal format: 11 bosluk + veri
# Satir 1: veri direkt basliyor

# Tum satirlari incele: basta bosluk sayisi
print("Basta bosluk sayilari:")
offset_counts = {}
for i, line in enumerate(lines):
    leading = len(line) - len(line.lstrip())
    offset_counts.setdefault(leading, []).append(i+1)

for offset in sorted(offset_counts.keys()):
    rows = offset_counts[offset]
    sample = rows[:5]
    print("  %2d bosluk: %d satir (ornekler: %s)" % (offset, len(rows), sample))

print()

# Satir 1'i 11 karakter saga kaydirsak normal formata uyar mi?
shifted_line1 = ' ' * 11 + line1
print("Kaymis Satir 1 kontrol:")
print("  Ogr No pos 11-16: %r" % shifted_line1[11:16])
print("  Ad Soyad pos 16-36: %r" % shifted_line1[16:36])
print("  TC pos 36-48: %r" % shifted_line1[36:48])
print("  Kitapcik pos 55: %r" % shifted_line1[55:56])
print("  Cevaplar pos 56-76: %r" % shifted_line1[56:76])

print()
print("Normal Satir 3 kontrol:")
print("  Ogr No pos 11-16: %r" % line3[11:16])
print("  Ad Soyad pos 16-36: %r" % line3[16:36])
print("  TC pos 36-48: %r" % line3[36:48])
print("  Kitapcik pos 55: %r" % line3[55:56])
print("  Cevaplar pos 56-76: %r" % line3[56:76])

# Kitapcik bilgisi olmayan ogrenciler
print("\n\n=== KITAPCIK ANALIZI ===")
no_booklet = []
a_booklet = []
b_booklet = []
for i, line in enumerate(lines):
    if len(line) < 56:
        # Kisa satir
        leading = len(line) - len(line.lstrip())
        if leading == 0:
            # Kaymis satir
            padded = ' ' * 11 + line
            if len(padded) > 55:
                bk = padded[55:56].strip().upper()
            else:
                bk = ''
        else:
            bk = line[55:56].strip().upper() if len(line) > 55 else ''
    else:
        bk = line[55:56].strip().upper()
    
    if bk == 'A':
        a_booklet.append(i+1)
    elif bk == 'B':
        b_booklet.append(i+1)
    else:
        # Ad soyadi bul
        if len(line) - len(line.lstrip()) == 0:
            name = line[5:25].strip()
        else:
            name = line[16:36].strip()
        no_booklet.append((i+1, bk, name))

print("A kitapcigi: %d ogrenci" % len(a_booklet))
print("B kitapcigi: %d ogrenci" % len(b_booklet))
print("Kitapcik yok: %d ogrenci" % len(no_booklet))
for row, bk, name in no_booklet[:20]:
    print("  Satir %3d: bk=%r name=%s" % (row, bk, name))
