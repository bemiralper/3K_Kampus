#!/usr/bin/env python
"""DAT dosyasında kitapçık pozisyonunu analiz et."""

dat_path = '/Users/taner/Documents/3K Kampüs LMS/AYT Deneme Sınavları/3k_kampus_ulti_tyt_tg.dat'
with open(dat_path, 'r', encoding='windows-1254') as f:
    lines = f.read().strip().splitlines()

# pos 55'teki unique değerler
vals = set()
for line in lines:
    if len(line) > 55:
        vals.add(line[55])
print("Pos 55 unique:", sorted(vals))

# Satır 3: pos55='A', cevaplar pos56+
line = lines[2]
print("Satir 3: pos55=%r, cevaplar pos56+: %s..." % (line[55], line[56:76]))

# Satır 8: pos55='B'
line = lines[7]
print("Satir 8: pos55=%r, cevaplar pos56+: %s..." % (line[55], line[56:76]))

# Satır 13: pos55='B'
line = lines[12]
print("Satir 13: pos55=%r, cevaplar pos56+: %s..." % (line[55], line[56:76]))

# A vs B oranı
a_count = b_count = other_count = 0
for line in lines:
    if len(line) > 55:
        c = line[55]
        if c == 'A':
            a_count += 1
        elif c == 'B':
            b_count += 1
        else:
            other_count += 1
print("\nKitapcik dagilimi pos55: A=%d, B=%d, other=%d" % (a_count, b_count, other_count))

# İlk satır (farklı formatta)
line = lines[0]
print("\nSatir 1 (222 uzunluga gore):", len(line))
# İlk satır 5 rakamla başlıyor: '00122'
print("Satir 1 pos0-10:", repr(line[0:11]))
print("Satir 1 pos11-55:", repr(line[11:56]))
