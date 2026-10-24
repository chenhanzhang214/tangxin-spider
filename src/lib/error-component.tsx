import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "发生了意外错误，请重新加载。";
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">暂时无法显示此页面</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">
        {message || "发生了意外错误，请重新加载。"}
      </p>
    </main>
  );
}
