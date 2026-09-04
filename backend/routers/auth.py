from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel
import hashlib

router = APIRouter()

# Very basic hashing for the prototype. In production, use passlib/bcrypt.
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

class SignupRequest(BaseModel):
    name: str
    username: str
    email: str
    phone: str
    password: str

class LoginRequest(BaseModel):
    identifier: str # username or email
    password: str

class OTPRequest(BaseModel):
    vendor_id: str
    otp: str

@router.post("/signup")
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    # Check if username or email already exists
    existing_user = db.query(models.Vendor).filter(
        (models.Vendor.username == req.username) | 
        (models.Vendor.email == req.email)
    ).first()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or Email already exists")
        
    new_vendor = models.Vendor(
        name=req.name,
        username=req.username,
        email=req.email,
        phone=req.phone,
        password_hash=hash_password(req.password),
        store_name=f"{req.name}'s Store" # Default store name
    )
    
    db.add(new_vendor)
    db.commit()
    db.refresh(new_vendor)
    
    return {"message": "Signup successful", "vendor_id": new_vendor.id}

@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # Find user by username or email
    vendor = db.query(models.Vendor).filter(
        (models.Vendor.username == req.identifier) | 
        (models.Vendor.email == req.identifier)
    ).first()
    
    if not vendor or vendor.password_hash != hash_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    # Trigger mock OTP (in real app, this sends SMS/Email)
    return {"message": "OTP sent to your registered phone/email", "vendor_id": vendor.id}

@router.post("/verify-otp")
def verify_otp(req: OTPRequest, db: Session = Depends(get_db)):
    # Accept universal test code '123456' for the prototype
    if req.otp != "123456":
        raise HTTPException(status_code=401, detail="Invalid OTP code")
        
    vendor = db.query(models.Vendor).filter(models.Vendor.id == req.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
        
    return {
        "message": "Login successful",
        "vendor_id": vendor.id,
        "token": f"mock_token_{vendor.id}" # In real app, return JWT
    }
