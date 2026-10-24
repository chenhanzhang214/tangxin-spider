import { Check, Copy, Loader2, Tablet, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LanServiceStatus } from "@/types/desktop";

export function LanServicePanel() {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [status, setStatus] = useState<LanServiceStatus | null>(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState("");

  useEffect(() => {
    let active = true;
    const bridge = window.tangxinDesktop;
    setDesktop(Boolean(bridge?.getLanServiceStatus));
    if (bridge?.getLanServiceStatus) {
      void bridge
        .getLanServiceStatus()
        .then((value) => {
          if (active) {
            setStatus(value);
            setError(value.error ?? null);
          }
        })
        .catch(() => {
          if (active) setError("无法读取局域网服务状态，请重新打开程序。");
        });
    } else {
      setBrowserUrl(window.location.origin);
    }
    return () => {
      active = false;
    };
  }, []);

  async function toggle() {
    const bridge = window.tangxinDesktop;
    if (!bridge || !status || changing) return;
    setChanging(true);
    setError(null);
    try {
      const next = await bridge.setLanServiceEnabled(!status.enabled);
      setStatus(next);
      setError(next.error ?? null);
      setCopiedUrl(null);
    } catch {
      setError("切换失败，请检查端口或网络权限后重试。");
      const next = await bridge.getLanServiceStatus().catch(() => null);
      if (next) setStatus(next);
    } finally {
      setChanging(false);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
    } catch {
      setError("无法自动复制，请选中地址后手动复制。");
    }
  }

  const urls = desktop ? (status?.urls ?? []) : browserUrl ? [browserUrl] : [];

  return (
    <section
      aria-labelledby="lan-service-title"
      className="rounded-lg border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated text-accent">
            <Wifi className="size-5" />
          </div>
          <div>
            <h3 id="lan-service-title" className="font-display text-xl text-fg">
              局域网服务
            </h3>
            <p id="lan-service-help" className="mt-1 text-sm leading-relaxed text-muted">
              {desktop === false
                ? "浏览器访问模式。请在电脑桌面版中操作开关；start-server.bat 启动的服务由脚本窗口管理。"
                : "开启后，同一局域网的 iPad、手机或电脑可访问媒体库和下载功能。选择会保存，下次启动自动恢复。"}
            </p>
          </div>
        </div>
        {desktop && (
          <button
            type="button"
            role="switch"
            aria-label="局域网服务"
            aria-describedby="lan-service-help"
            aria-checked={status?.enabled ?? false}
            disabled={!status || changing}
            onClick={() => void toggle()}
            className="inline-flex min-h-11 items-center gap-3 rounded-md px-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-60"
          >
            {changing ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <span aria-hidden="true">{status?.enabled ? "已开启" : "已关闭"}</span>
            )}
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors",
                status?.enabled ? "bg-accent" : "bg-line-strong",
              )}
            >
              <span
                className={cn(
                  "size-5 rounded-full bg-bg shadow-sm transition-transform",
                  status?.enabled ? "translate-x-5" : "translate-x-0",
                )}
              />
            </span>
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className="mt-4 text-sm text-muted">
        {changing
          ? "正在切换…"
          : desktop === null || (desktop && !status && !error)
            ? "正在读取服务状态…"
            : desktop
              ? status?.enabled
                ? `局域网服务已开启 · 端口 ${status.port}`
                : status
                  ? "局域网服务已关闭，仅本机可访问。"
                  : "无法确认服务状态。"
              : "当前通过浏览器连接服务。"}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-clay">
          {error}
        </p>
      )}
      {urls.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-xs text-muted">
            {desktop ? "在其他设备浏览器中打开：" : "当前访问地址："}
          </p>
          {urls.map((url) => (
            <div
              key={url}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-bg px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Tablet className="size-4 shrink-0 text-accent" />
                <code className="select-all break-all text-sm text-fg">{url}</code>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void copyUrl(url)}
                aria-label={`复制访问地址 ${url}`}
              >
                {copiedUrl === url ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copiedUrl === url ? "已复制" : "复制"}
              </Button>
            </div>
          ))}
        </div>
      )}
      {desktop && status?.enabled && urls.length === 0 && (
        <p className="mt-3 text-sm text-muted">暂未检测到局域网地址，请检查电脑网络连接。</p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted">
        关闭开关会断开局域网设备的连接，本机窗口和本机下载继续运行。服务仅用于受信任的局域网；其他设备发起下载时，文件先保存在电脑，可再从媒体库保存到设备。
      </p>
    </section>
  );
}
