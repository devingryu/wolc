import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { ThemeProvider } from "./components/theme-provider";
import "./i18n/i18n";
import { locale } from '@tauri-apps/plugin-os';
import i18n from "./i18n/i18n";

// 앱을 초기화하고 렌더링하는 비동기 함수
async function initializeApp() {
  let detectedLng = 'en'; 

  try {
    const osLocale = await locale(); 
    if (osLocale) {
      detectedLng = osLocale.split('-')[0];
      console.log(`Detected OS locale: ${osLocale}, Using language: ${detectedLng}`);
    } else {
      console.warn("OS locale returned null or empty.");
    }
  } catch (error) {
    console.error("Failed to get OS locale, using fallback:", error);
  }

  const supportedLngs = ['ko', 'en']; 
  if (!supportedLngs.includes(detectedLng)) {
      console.warn(`Detected language "${detectedLng}" is not supported. Falling back.`);
      detectedLng = 'en'; 
  }

  await i18n.init({
      lng: detectedLng,
  });

  // React 앱 렌더링
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>
  );
}

// 앱 초기화 함수 호출
initializeApp();
