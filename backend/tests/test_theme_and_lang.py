# Backend test for vendor preference storage
import pytest

def test_vendor_profile_preferences_schema():
    from schemas import VendorResponse, VendorUpdate
    # Verify VendorResponse and VendorUpdate schema fields
    fields = VendorResponse.model_fields.keys()
    assert "store_name" in fields
    assert "name" in fields
    update_fields = VendorUpdate.model_fields.keys()
    assert "store_name" in update_fields
    assert "name" in update_fields
