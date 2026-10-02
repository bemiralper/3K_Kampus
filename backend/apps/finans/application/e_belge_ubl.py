"""Uyumsoft SaveAsDraft gövdesi için UBL-TR fatura."""
from __future__ import annotations

from decimal import Decimal
from xml.sax.saxutils import escape


def build_invoice_children(*, belge_tipi: str, yerel_no: str, ettn: str, issue_date: str,
                           note: str, supplier: dict, customer: dict, satirlar: list[dict],
                           matrah, kdv, odenecek) -> str:
    profile = 'EARSIVFATURA' if belge_tipi == 'earsiv' else 'TEMELFATURA'
    parts = [
        '<cbc:UBLVersionID>2.1</cbc:UBLVersionID>',
        '<cbc:CustomizationID>TR1.2</cbc:CustomizationID>',
        f'<cbc:ProfileID>{profile}</cbc:ProfileID>',
        f'<cbc:ID>{escape(yerel_no)}</cbc:ID>',
        '<cbc:CopyIndicator>false</cbc:CopyIndicator>',
        f'<cbc:UUID>{escape(ettn)}</cbc:UUID>',
        f'<cbc:IssueDate>{escape(issue_date)}</cbc:IssueDate>',
        '<cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>',
        f'<cbc:Note>{escape(note)}</cbc:Note>',
        '<cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>',
        f'<cbc:LineCountNumeric>{len(satirlar)}</cbc:LineCountNumeric>',
    ]
    if belge_tipi == 'earsiv':
        parts.append(
            '<cac:AdditionalDocumentReference>'
            '<cbc:ID>ELEKTRONIK</cbc:ID>'
            f'<cbc:IssueDate>{escape(issue_date)}</cbc:IssueDate>'
            '<cbc:DocumentTypeCode>SEND_TYPE</cbc:DocumentTypeCode>'
            '</cac:AdditionalDocumentReference>'
        )
    parts.append(_party('AccountingSupplierParty', supplier, person=False))
    parts.append(_party('AccountingCustomerParty', customer, person=customer.get('kisi')))
    parts.append(_tax_total(satirlar, kdv))
    parts.append(
        '<cac:LegalMonetaryTotal>'
        f'<cbc:LineExtensionAmount currencyID="TRY">{_m(matrah)}</cbc:LineExtensionAmount>'
        f'<cbc:TaxExclusiveAmount currencyID="TRY">{_m(matrah)}</cbc:TaxExclusiveAmount>'
        f'<cbc:TaxInclusiveAmount currencyID="TRY">{_m(odenecek)}</cbc:TaxInclusiveAmount>'
        f'<cbc:PayableAmount currencyID="TRY">{_m(odenecek)}</cbc:PayableAmount>'
        '</cac:LegalMonetaryTotal>'
    )
    for index, line in enumerate(satirlar, start=1):
        parts.append(_invoice_line(index, line))
    return ''.join(parts)


def _party(tag: str, party: dict, *, person: bool) -> str:
    scheme = 'TCKN' if person else 'VKN'
    name_block = (
        '<cac:Person>'
        f'<cbc:FirstName>{escape(party.get("ad") or "-")}</cbc:FirstName>'
        f'<cbc:FamilyName>{escape(party.get("soyad") or "-")}</cbc:FamilyName>'
        '</cac:Person>'
        if person else
        '<cac:PartyName>'
        f'<cbc:Name>{escape(party.get("unvan") or "-")}</cbc:Name>'
        '</cac:PartyName>'
    )
    tax_name = party.get('vergi_dairesi') or ('TCKN' if person else 'Vergi Dairesi')
    return (
        f'<cac:{tag}><cac:Party>'
        '<cac:PartyIdentification>'
        f'<cbc:ID schemeID="{scheme}">{escape(party.get("vkn") or "")}</cbc:ID>'
        '</cac:PartyIdentification>'
        f'{name_block}'
        '<cac:PostalAddress>'
        f'<cbc:StreetName>{escape(party.get("adres") or "-")}</cbc:StreetName>'
        f'<cbc:CitySubdivisionName>{escape(party.get("ilce") or "Merkez")}</cbc:CitySubdivisionName>'
        f'<cbc:CityName>{escape(party.get("il") or "Merkez")}</cbc:CityName>'
        '<cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>'
        '</cac:PostalAddress>'
        '<cac:PartyTaxScheme><cac:TaxScheme>'
        f'<cbc:Name>{escape(tax_name)}</cbc:Name>'
        '</cac:TaxScheme></cac:PartyTaxScheme>'
        '</cac:Party></cac:' + tag + '>'
    )


def _tax_total(satirlar: list[dict], kdv) -> str:
    grouped: dict[int, dict] = {}
    for line in satirlar:
        rate = int(line['kdv_orani'])
        bucket = grouped.setdefault(rate, {'matrah': Decimal('0'), 'kdv': Decimal('0')})
        bucket['matrah'] += Decimal(str(line['matrah']))
        bucket['kdv'] += Decimal(str(line['kdv']))
    subs = []
    for rate, bucket in grouped.items():
        exemption = ''
        if rate == 0:
            exemption = (
                '<cbc:TaxExemptionReasonCode>351</cbc:TaxExemptionReasonCode>'
                '<cbc:TaxExemptionReason>İstisna olmayan diğer</cbc:TaxExemptionReason>'
            )
        subs.append(
            '<cac:TaxSubtotal>'
            f'<cbc:TaxableAmount currencyID="TRY">{_m(bucket["matrah"])}</cbc:TaxableAmount>'
            f'<cbc:TaxAmount currencyID="TRY">{_m(bucket["kdv"])}</cbc:TaxAmount>'
            f'<cbc:Percent>{rate}</cbc:Percent>'
            '<cac:TaxCategory>'
            f'{exemption}'
            '<cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>'
            '</cac:TaxCategory>'
            '</cac:TaxSubtotal>'
        )
    return (
        '<cac:TaxTotal>'
        f'<cbc:TaxAmount currencyID="TRY">{_m(kdv)}</cbc:TaxAmount>'
        + ''.join(subs)
        + '</cac:TaxTotal>'
    )


def _invoice_line(index: int, line: dict) -> str:
    rate = int(line['kdv_orani'])
    exemption = ''
    if rate == 0:
        exemption = (
            '<cbc:TaxExemptionReasonCode>351</cbc:TaxExemptionReasonCode>'
            '<cbc:TaxExemptionReason>İstisna olmayan diğer</cbc:TaxExemptionReason>'
        )
    return (
        '<cac:InvoiceLine>'
        f'<cbc:ID>{index}</cbc:ID>'
        '<cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>'
        f'<cbc:LineExtensionAmount currencyID="TRY">{_m(line["matrah"])}</cbc:LineExtensionAmount>'
        '<cac:TaxTotal>'
        f'<cbc:TaxAmount currencyID="TRY">{_m(line["kdv"])}</cbc:TaxAmount>'
        '<cac:TaxSubtotal>'
        f'<cbc:TaxableAmount currencyID="TRY">{_m(line["matrah"])}</cbc:TaxableAmount>'
        f'<cbc:TaxAmount currencyID="TRY">{_m(line["kdv"])}</cbc:TaxAmount>'
        f'<cbc:Percent>{rate}</cbc:Percent>'
        '<cac:TaxCategory>'
        f'{exemption}'
        '<cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>'
        '</cac:TaxCategory>'
        '</cac:TaxSubtotal>'
        '</cac:TaxTotal>'
        '<cac:Item>'
        f'<cbc:Name>{escape(line["ad"])}</cbc:Name>'
        '</cac:Item>'
        '<cac:Price>'
        f'<cbc:PriceAmount currencyID="TRY">{_m(line["matrah"])}</cbc:PriceAmount>'
        '</cac:Price>'
        '</cac:InvoiceLine>'
    )


def _m(value) -> str:
    return f'{Decimal(str(value)).quantize(Decimal("0.01")):.2f}'
