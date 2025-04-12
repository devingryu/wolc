import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from 'i18next-browser-languagedetector';

import en from "./en.json";
import ko from "./ko.json";

const resources = {
  en: {
    translation: en,
  },
  ko: {
    translation: ko,
  },
};

i18n.use(initReactI18next).use(LanguageDetector).init({
  debug: true,
  supportedLngs: ['ko', 'en'],
  resources,
  fallbackLng: "ko",
//   keySeparator: false,
//   interpolation: {
//     escapeValue: false,
//   },
});

export default i18n;
