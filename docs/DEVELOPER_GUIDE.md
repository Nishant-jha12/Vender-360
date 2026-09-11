# Vendor360 Developer Guide

## 🛠 Local Setup
```bash
# Python Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload

# React Frontend
cd frontend
npm install
npm run dev
```

## 🧪 Running Tests
```bash
# Backend pytest suite (131 tests)
pytest backend/

# Frontend localization check
npm --prefix frontend run i18n:check

# Frontend build verification
npm --prefix frontend run build
```
