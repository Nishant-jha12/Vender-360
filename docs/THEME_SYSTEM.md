# Vendor360 Theme System

The application supports responsive **Light and Dark themes**, persistent across user sessions and synchronized across browser tabs.

## 🎨 Design Tokens

Themes are driven by CSS variables in `frontend/src/index.css`:

| Token | Light Mode Value | Dark Mode Value |
|---|---|---|
| `--brand-primary` | `26 115 232` (#1a73e8) | `138 180 248` (#8ab4f8) |
| `--brand-primary-dark` | `21 88 214` (#1558d6) | `168 199 250` (#a8c7fa) |
| `--brand-bg` | `248 249 250` (#f8f9fa) | `32 33 36` (#202124) |
| `--brand-surface` | `255 255 255` (#ffffff) | `41 42 45` (#292a2d) |
| `--brand-ink` | `32 33 36` (#202124) | `232 234 237` (#e8eaed) |
| `--brand-muted` | `95 99 104` (#5f6368) | `154 160 166` (#9aa0a6) |
| `--brand-border` | `218 220 224` (#dadce0) | `60 64 67` (#3c4043) |

## 🌓 Theme Toggle Locations
1. **Home Screen (`Dashboard.jsx`)**: Segmented pill switcher with Sun/Moon icons.
2. **Top Navigation (`App.jsx`)**: Fast-action toggle button.
3. **Login Card (`Auth.jsx`)**: Header toggle for pre-authenticated visitors.
4. **Account Settings (`Account.jsx`)**: Dedicated preference card.
