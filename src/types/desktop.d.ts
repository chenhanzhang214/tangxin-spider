export {};

declare global {
  interface Window {
    tangxinDesktop?: {
      selectDownloadDirectory: (currentDirectory: string) => Promise<string | null>;
    };
  }
}
