"""Turning a barcode into product details.

Three layers, cheapest first, so most scans never touch the network:

  1. The number itself. An EAN-13/EAN-8/UPC-A carries a check digit and a GS1
     prefix, so a mistyped code and the country of registration are both known
     offline -- which matters in a shop with patchy signal.
  2. This vendor's own catalogue, handled by the callers.
  3. An open product database, cached in the table below so the same barcode is
     only ever fetched once.

The lookup is off by default. It sends the barcode -- and nothing else, no shop
identity -- to a third party, and that should be a decision the shopkeeper's
operator makes rather than something that happens quietly. See
BARCODE_LOOKUP_ENABLED.
"""
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

import models
from config import settings

log = logging.getLogger("vendor360.barcodes")

# A real Open Food Facts taxonomy entry: lowercase, hyphenated, ASCII.
_TAXONOMY_TAG = re.compile(r"en:[a-z0-9]+(?:-[a-z0-9]+)*")

# GS1 prefixes worth naming for an Indian kirana shop: its own, its neighbours,
# and the origins that turn up most on imported stock.
_GS1_PREFIXES = [
    ((0, 19), "USA / Canada"),
    ((30, 39), "France"),
    ((300, 379), "France"),
    ((400, 440), "Germany"),
    ((450, 459), "Japan"),
    ((460, 469), "Russia"),
    ((471, 471), "Taiwan"),
    ((480, 480), "Philippines"),
    ((489, 489), "Hong Kong"),
    ((490, 499), "Japan"),
    ((500, 509), "United Kingdom"),
    ((520, 521), "Greece"),
    ((539, 539), "Ireland"),
    ((540, 549), "Belgium / Luxembourg"),
    ((560, 560), "Portugal"),
    ((569, 569), "Iceland"),
    ((570, 579), "Denmark"),
    ((590, 590), "Poland"),
    ((594, 594), "Romania"),
    ((599, 599), "Hungary"),
    ((600, 601), "South Africa"),
    ((603, 603), "Ghana"),
    ((608, 608), "Bahrain"),
    ((609, 609), "Mauritius"),
    ((611, 611), "Morocco"),
    ((613, 613), "Algeria"),
    ((616, 616), "Kenya"),
    ((619, 619), "Tunisia"),
    ((621, 621), "Syria"),
    ((622, 622), "Egypt"),
    ((625, 625), "Jordan"),
    ((626, 626), "Iran"),
    ((627, 627), "Kuwait"),
    ((628, 628), "Saudi Arabia"),
    ((629, 629), "United Arab Emirates"),
    ((640, 649), "Finland"),
    ((690, 699), "China"),
    ((700, 709), "Norway"),
    ((729, 729), "Israel"),
    ((730, 739), "Sweden"),
    ((740, 745), "Central America"),
    ((746, 746), "Dominican Republic"),
    ((750, 750), "Mexico"),
    ((759, 759), "Venezuela"),
    ((760, 769), "Switzerland"),
    ((770, 771), "Colombia"),
    ((773, 773), "Uruguay"),
    ((775, 775), "Peru"),
    ((777, 777), "Bolivia"),
    ((779, 779), "Argentina"),
    ((780, 780), "Chile"),
    ((784, 784), "Paraguay"),
    ((786, 786), "Ecuador"),
    ((789, 790), "Brazil"),
    ((800, 839), "Italy"),
    ((840, 849), "Spain"),
    ((850, 850), "Cuba"),
    ((858, 858), "Slovakia"),
    ((859, 859), "Czechia"),
    ((860, 860), "Serbia"),
    ((865, 865), "Mongolia"),
    ((867, 867), "North Korea"),
    ((868, 869), "Turkey"),
    ((870, 879), "Netherlands"),
    ((880, 880), "South Korea"),
    ((884, 884), "Cambodia"),
    ((885, 885), "Thailand"),
    ((888, 888), "Singapore"),
    ((890, 890), "India"),
    ((893, 893), "Vietnam"),
    ((896, 896), "Pakistan"),
    ((899, 899), "Indonesia"),
    ((900, 919), "Austria"),
    ((930, 939), "Australia"),
    ((940, 949), "New Zealand"),
    ((955, 955), "Malaysia"),
    ((958, 958), "Macau"),
    # Bookland: stationery and magazines carry these rather than a country.
    ((977, 977), "Periodical (ISSN)"),
    ((978, 979), "Book (ISBN)"),
]


def normalise(code: Optional[str]) -> str:
    """Digits only. Scanners and people both add spaces and dashes."""
    return "".join(ch for ch in (code or "") if ch.isdigit())


def check_digit_ok(code: str) -> Optional[bool]:
    """Verify the GS1 check digit. None when the length is not a GS1 one.

    A single mistyped digit is caught here, before it becomes a product nobody
    can scan again.
    """
    digits = normalise(code)
    if len(digits) not in (8, 12, 13, 14):
        return None

    body, check = digits[:-1], int(digits[-1])
    # Weights alternate 3 and 1 from the rightmost body digit leftwards.
    total = 0
    for index, char in enumerate(reversed(body)):
        total += int(char) * (3 if index % 2 == 0 else 1)
    return (10 - total % 10) % 10 == check


def country_of_origin(code: str) -> Optional[str]:
    """Where the barcode was registered -- not always where it was made."""
    digits = normalise(code)
    if len(digits) < 3:
        return None
    prefix = int(digits[:3])
    for (low, high), name in _GS1_PREFIXES:
        if low <= prefix <= high:
            return name
    return None


def describe(code: str) -> dict:
    """Everything the number alone can tell us. Never touches the network."""
    digits = normalise(code)
    valid = check_digit_ok(digits)
    return {
        "barcode": digits,
        "check_digit_valid": valid,
        "country": country_of_origin(digits),
        "symbology": {8: "EAN-8", 12: "UPC-A", 13: "EAN-13", 14: "ITF-14"}.get(len(digits)),
    }


# --------------------------------------------------------------------------
# Open product database
# --------------------------------------------------------------------------
def _squash(text: str) -> str:
    """Letters and digits only, lowercased -- for comparing names loosely."""
    return "".join(ch for ch in text.lower() if ch.isalnum())


def _mentions(name: str, brand: str) -> bool:
    """Is the brand already in the name?

    Compared with the punctuation removed, or "Lay's" reads as absent from
    "Lays Classics Salted" and the shop ends up with "Lay's Lays Classics".
    """
    return _squash(brand) in _squash(name)


def _english_category(product: dict) -> Optional[str]:
    """The category in English, or nothing at all.

    Category text arrives in whatever language the contributor typed, and the
    "en:" prefix is not the guarantee it looks like: anything outside the
    taxonomy is passed through with the prefix bolted on, so a jar of Nutella
    offers `en:Pates a tartiner` alongside the real `en:sweet-spreads`.

    A genuine taxonomy entry is lowercase, hyphenated and ASCII. Everything
    else is discarded -- a French phrase in an Indian shop's catalogue is worse
    than the blank the shopkeeper would have filled in anyway.
    """
    tags = product.get("categories_tags")
    if not isinstance(tags, list):
        return None

    taxonomy = [
        tag[3:]
        for tag in tags
        if isinstance(tag, str) and _TAXONOMY_TAG.fullmatch(tag)
    ]
    if not taxonomy:
        return None

    # Last is the most specific: en:snacks -> en:salty-snacks -> en:crisps
    return taxonomy[-1].replace("-", " ").strip().capitalize() or None


def _fetch_remote(barcode: str) -> Optional[dict]:
    url = settings.BARCODE_LOOKUP_URL.replace("{barcode}", urllib.parse.quote(barcode))
    request = urllib.request.Request(
        url,
        headers={
            # Open Food Facts asks callers to identify themselves.
            "User-Agent": "Vendor360/2.0 (kirana retail inventory; self-hosted)",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=settings.BARCODE_LOOKUP_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        log.info("Barcode lookup for %s failed: %s", barcode, type(exc).__name__)
        return None

    if payload.get("status") != 1 or not isinstance(payload.get("product"), dict):
        return None

    product = payload["product"]

    def first(*keys):
        for key in keys:
            value = product.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    name = first("product_name_en", "product_name", "generic_name_en", "generic_name")
    if not name:
        return None

    brand = (first("brands") or "").split(",")[0].strip() or None
    category = _english_category(product)

    return {
        "sku_name": f"{brand} {name}".strip() if brand and not _mentions(name, brand) else name,
        "brand": brand,
        "size": first("quantity", "net_weight"),
        "category": category,
        "image_url": first("image_front_small_url", "image_small_url", "image_url"),
        "source": settings.BARCODE_LOOKUP_SOURCE,
    }


def lookup(barcode: str, db: Session) -> Optional[dict]:
    """Product details for a barcode, from the cache or the open database.

    Cached rows are reused indefinitely: a barcode identifies one product
    forever, so there is nothing to go stale, and a cached hit means a shop with
    no signal still gets the details on a re-scan.
    """
    digits = normalise(barcode)
    if not digits:
        return None

    cached = (
        db.query(models.ProductLookupCache)
        .filter(models.ProductLookupCache.barcode == digits)
        .first()
    )
    if cached is not None:
        # A previous miss is remembered too, so an unlisted local brand is not
        # re-fetched on every scan -- but only for a while, in case it is added.
        if cached.payload:
            try:
                return json.loads(cached.payload)
            except ValueError:
                pass
        elif cached.fetched_at and cached.fetched_at > datetime.utcnow() - timedelta(days=30):
            return None

    if not settings.BARCODE_LOOKUP_ENABLED:
        return None

    try:
        found = _fetch_remote(digits)
    except Exception:  # noqa: BLE001
        # A convenience lookup must never take a scan down with it. The
        # shopkeeper still gets the form, just without the name filled in.
        log.exception("Barcode lookup raised for %s", digits)
        return None

    if cached is None:
        cached = models.ProductLookupCache(barcode=digits)
        db.add(cached)
    cached.payload = json.dumps(found) if found else None
    cached.source = settings.BARCODE_LOOKUP_SOURCE
    cached.fetched_at = datetime.utcnow()
    db.commit()

    return found
