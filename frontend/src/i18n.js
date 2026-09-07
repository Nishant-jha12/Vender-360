import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import bn from './locales/bn.json';
import en from './locales/en.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';

/**
 * Translations live in locales/*.json, one file per language.
 *
 * They used to sit in one JS object here. With four languages that file was
 * heading for a thousand lines, and a missing key in one language was
 * invisible -- the app just showed English and nobody noticed. Separate files
 * diff cleanly per language, and `npm run i18n:check` compares their key sets.
 *
 * The languages offered in Account, and the speech-recognition locales in
 * VoiceEntry, must stay in step with this list.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी (Hindi)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
];

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  mr: { translation: mr },
  bn: { translation: bn },
};

const stored = localStorage.getItem('vendor_lang');
const supported = LANGUAGES.some((l) => l.code === stored);

i18n.use(initReactI18next).init({
  resources,
  lng: supported ? stored : 'en',
  fallbackLng: 'en',
  interpolation: {
    // React already escapes everything it renders.
    escapeValue: false,
  },
});

/**
 * Keep <html lang> in step with the language on screen.
 *
 * It was stuck at "en" whatever was chosen, which tells a screen reader to
 * pronounce Hindi with English rules -- unintelligible -- and stops the browser
 * hyphenating or picking fonts correctly.
 */
const applyDocumentLanguage = (code) => {
  if (typeof document !== 'undefined') document.documentElement.lang = code;
};

applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
