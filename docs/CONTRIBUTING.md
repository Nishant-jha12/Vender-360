# Contributing to Vendor360

We welcome contributions to help empower local Kirana store owners and retailers across India!

## 🤝 Code Standards & Git Workflow

1. **Commit Messages**:
   - Follow the Conventional Commits specification: `feat(...)`, `fix(...)`, `docs(...)`, `chore(...)`, `refactor(...)`.
   - Keep commit messages concise, descriptive, and focused on a single change.
2. **Vernacular Translations (i18n)**:
   - Any new user-facing text must be added across all 4 supported languages:
     - English (`frontend/src/locales/en.json`)
     - Hindi (`frontend/src/locales/hi.json`)
     - Marathi (`frontend/src/locales/mr.json`)
     - Bengali (`frontend/src/locales/bn.json`)
   - Validate key parity before committing:
     ```bash
     npm --prefix frontend run i18n:check
     ```
3. **Local Tests & Linting**:
   - Run backend test suite:
     ```bash
     python -m pytest backend/
     ```
   - Verify frontend builds cleanly:
     ```bash
     npm --prefix frontend run lint
     npm --prefix frontend run build
     ```
4. **Clean Git History**:
   - Keep IDE, assistant, and local environment files strictly in `.gitignore`.
   - Never commit secrets, token files, or private certificates.
