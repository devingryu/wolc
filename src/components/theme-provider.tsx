import { createContext, useContext, useEffect, useState, useCallback } from "react"; // useCallback 추가

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  // 테마 적용 로직을 별도 함수로 분리 (가독성 및 재사용성)
  const applyTheme = useCallback((currentTheme: Theme) => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    let finalTheme: "light" | "dark";

    if (currentTheme === "system") {
      finalTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } else {
      finalTheme = currentTheme;
    }

    root.classList.add(finalTheme);
  }, []);


  useEffect(() => {
    // 현재 설정된 테마(light, dark, system)에 따라 즉시 테마 적용
    applyTheme(theme);

    // 시스템 테마 변경 감지 리스너 설정 (theme가 'system'일 때만)
    let mediaQuery: MediaQueryList | undefined;
    let handleChange: (() => void) | undefined;

    if (theme === "system") {
        mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        // 시스템 테마 변경 시 applyTheme 재호출 (항상 'system' 인자로 호출하여 내부에서 재계산)
        handleChange = () => applyTheme("system");

        mediaQuery.addEventListener("change", handleChange);
    }

    // 클린업 함수: 컴포넌트 언마운트 시 또는 theme 상태가 변경되기 직전에 실행됨
    return () => {
      if (mediaQuery && handleChange) {
        mediaQuery.removeEventListener("change", handleChange);
      }
    };
  }, [theme, applyTheme]); // theme 또는 applyTheme 함수가 변경될 때마다 effect 재실행

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme);
      setTheme(newTheme); // 상태 업데이트 -> useEffect 트리거
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
