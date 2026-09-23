import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getSoundboxSettings,
  saveSoundboxSettings,
  announcePayment as triggerAnnounce,
  testSoundboxVoice,
} from '../lib/soundbox';

const SoundboxContext = createContext();

export function SoundboxProvider({ children }) {
  const { i18n } = useTranslation();
  const [settings, setSettingsState] = useState(() => getSoundboxSettings());

  // Keep soundbox language in sync with app language if soundbox lang was not explicitly customized
  useEffect(() => {
    const currentAppLang = i18n.language || 'en';
    const langMap = {
      en: 'en-IN',
      hi: 'hi-IN',
      mr: 'mr-IN',
      bn: 'bn-IN',
    };

    const hasStoredLang = localStorage.getItem('vendor360_soundbox_lang');
    if (!hasStoredLang && langMap[currentAppLang]) {
      setSettingsState(prev => {
        const next = { ...prev, lang: langMap[currentAppLang] };
        saveSoundboxSettings(next);
        return next;
      });
    }
  }, [i18n.language]);

  const setEnabled = useCallback((enabled) => {
    setSettingsState(prev => {
      const next = { ...prev, enabled };
      saveSoundboxSettings(next);
      return next;
    });
  }, []);

  const setLang = useCallback((lang) => {
    setSettingsState(prev => {
      const next = { ...prev, lang };
      saveSoundboxSettings(next);
      return next;
    });
  }, []);

  const setVolume = useCallback((volume) => {
    setSettingsState(prev => {
      const next = { ...prev, volume };
      saveSoundboxSettings(next);
      return next;
    });
  }, []);

  const announce = useCallback(async ({ amount, payerName = null, txnRef = null }) => {
    if (!settings.enabled) return;
    await triggerAnnounce({
      amount,
      lang: settings.lang,
      volume: settings.volume,
      payerName,
    });
  }, [settings]);

  const testVoice = useCallback(async (amount = 150, customLang = null) => {
    await testSoundboxVoice(amount, customLang || settings.lang);
  }, [settings]);

  return (
    <SoundboxContext.Provider
      value={{
        enabled: settings.enabled,
        lang: settings.lang,
        volume: settings.volume,
        setEnabled,
        setLang,
        setVolume,
        announce,
        testVoice,
      }}
    >
      {children}
    </SoundboxContext.Provider>
  );
}

export function useSoundbox() {
  const ctx = useContext(SoundboxContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    const s = getSoundboxSettings();
    return {
      enabled: s.enabled,
      lang: s.lang,
      volume: s.volume,
      setEnabled: () => {},
      setLang: () => {},
      setVolume: () => {},
      announce: (opts) => triggerAnnounce(opts),
      testVoice: (amt) => testSoundboxVoice(amt),
    };
  }
  return ctx;
}
