# Backend test for vendor preference storage
import pytest

def test_vendor_profile_preferences_schema():
    from schemas import VendorProfile
    # Verify VendorProfile schema fields
    fields = VendorProfile.model_fields.keys()
    assert "store_name" in fields
    assert "name" in fields
