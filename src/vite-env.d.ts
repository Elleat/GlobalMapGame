/// <reference types="vite/client" />

interface Window {
  desktopApi?: {
    isDesktop: boolean;
    openThemesFolder: () => Promise<string>;
  };
}

declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}
