export type LanServiceStatus = {
  enabled: boolean;
  port: number | null;
  urls: string[];
  error?: string;
};

declare global {
  interface Window {
    tangxinDesktop?: {
      getLanServiceStatus: () => Promise<LanServiceStatus>;
      setLanServiceEnabled: (enabled: boolean) => Promise<LanServiceStatus>;
      selectDownloadDirectory: (currentDirectory: string) => Promise<string | null>;
    };
  }
}
