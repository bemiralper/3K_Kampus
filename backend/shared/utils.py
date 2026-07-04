"""
Utility Functions
"""
from typing import Optional
import re


def generate_kod(ad: str) -> str:
    """
    Generate code from name
    
    Args:
        ad: Name to generate code from
        
    Returns:
        Generated code
    """
    # Turkish character mapping
    char_map = {
        'ç': 'c', 'Ç': 'C',
        'ğ': 'g', 'Ğ': 'G',
        'ı': 'i', 'İ': 'I',
        'ö': 'o', 'Ö': 'O',
        'ş': 's', 'Ş': 'S',
        'ü': 'u', 'Ü': 'U',
    }
    
    # Replace Turkish characters
    kod = ad
    for tr_char, en_char in char_map.items():
        kod = kod.replace(tr_char, en_char)
    
    # Remove special characters and convert to uppercase
    kod = re.sub(r'[^a-zA-Z0-9\s]', '', kod)
    kod = kod.upper().replace(' ', '_')
    
    return kod


def generate_schema_name(kurum_id: int, yil: str) -> str:
    """
    Generate schema name for education year
    
    Args:
        kurum_id: Institution ID
        yil: Education year (e.g., "2024-2025")
        
    Returns:
        Schema name
    """
    from shared.constants import SCHEMA_PREFIX
    yil_clean = yil.replace('-', '_')
    return f"{SCHEMA_PREFIX}{kurum_id}_{yil_clean}"


def parse_schema_name(schema_name: str) -> Optional[tuple]:
    """
    Parse schema name to extract kurum_id and year
    
    Args:
        schema_name: Schema name
        
    Returns:
        Tuple of (kurum_id, year) or None
    """
    from shared.constants import SCHEMA_PREFIX
    
    if not schema_name.startswith(SCHEMA_PREFIX):
        return None
    
    parts = schema_name[len(SCHEMA_PREFIX):].split('_')
    if len(parts) != 3:
        return None
    
    try:
        kurum_id = int(parts[0])
        year = f"{parts[1]}-{parts[2]}"
        return (kurum_id, year)
    except ValueError:
        return None
