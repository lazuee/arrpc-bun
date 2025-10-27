import type { ProcessInfo } from "../../types";
import { exists } from "node:fs/promises";

export async function getProcesses(): Promise<ProcessInfo[]> {
  try {
    const proc = Bun.spawn(["ps", "-awwxo", "pid=,args="]);
    const output = await new Response(proc.stdout).text();
    const lines = output.split("\n");

    const processes = await Promise.all(
      lines.map(async (line): Promise<ProcessInfo | null> => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return null;

        const firstSpaceIndex = trimmedLine.indexOf(" ");
        if (firstSpaceIndex === -1) return null;

        const pidNum = Number.parseInt(trimmedLine.substring(0, firstSpaceIndex), 10);
        const cmdline = trimmedLine.substring(firstSpaceIndex).trim();

        if (isNaN(pidNum) || pidNum <= 0) return null;
        if (!cmdline || cmdline.startsWith("[") || cmdline.startsWith("<")) {
          return null;
        }

        let exePath: string | undefined;
        let args: string[] = [];
        let foundPath = false;

        try {
          if (await exists(cmdline)) {
            exePath = cmdline;
            foundPath = true;
          }
        } catch {}

        if (!foundPath && cmdline.startsWith("/")) {
          let lastSpaceIdx = cmdline.lastIndexOf(" ");
          while (lastSpaceIdx > 0) {
            const potentialPath = cmdline.substring(0, lastSpaceIdx);
            try {
              if (await exists(potentialPath)) {
                exePath = potentialPath;
                args = cmdline
                  .substring(lastSpaceIdx + 1)
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean);
                foundPath = true;
                break;
              }
            } catch {}

            lastSpaceIdx = cmdline.lastIndexOf(" ", lastSpaceIdx - 1);
          }
        }

        if (!foundPath) {
          const parts = cmdline.split(/\s+/).filter(Boolean);
          if (parts.length > 0) {
            exePath = parts[0];
            args = parts.slice(1);
          }
        }

        if (exePath) {
          const appIndex = exePath.indexOf(".app/");
          if (appIndex !== -1) {
            const appEndIndex = appIndex + 4;
            exePath = exePath.substring(0, appEndIndex);
          }

          return [pidNum, exePath, args] as ProcessInfo;
        }

        return null;
      }),
    );

    return processes.filter((x): x is ProcessInfo => x !== null);
  } catch {
    return [];
  }
}
