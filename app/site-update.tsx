"use client";

import { useEffect, useState } from "react";
import { siteVersion, siteVersionHeader, siteVersionPath } from "../lib/site-version";

export function SiteUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!siteVersion || updateAvailable) return;
    const controller = new AbortController();
    let lastCheck = 0;
    let checking = false;

    async function checkVersion() {
      const now = Date.now();
      if (document.hidden || checking || now - lastCheck < 3_000) return;
      lastCheck = now;
      checking = true;
      try {
        const response = await fetch(siteVersionPath, {
          cache: "no-store",
          signal: controller.signal,
        });
        const publishedVersion = response.headers.get(siteVersionHeader);
        if (response.ok && publishedVersion && publishedVersion !== siteVersion && !controller.signal.aborted) {
          setUpdateAvailable(true);
        }
      } catch {
        // Retry on the next check if the connection is unavailable.
      } finally {
        checking = false;
      }
    }

    void checkVersion();
    const interval = window.setInterval(checkVersion, 60_000);
    window.addEventListener("focus", checkVersion);
    window.addEventListener("pageshow", checkVersion);
    document.addEventListener("visibilitychange", checkVersion);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", checkVersion);
      window.removeEventListener("pageshow", checkVersion);
      document.removeEventListener("visibilitychange", checkVersion);
    };
  }, [updateAvailable]);

  if (!updateAvailable) return null;
  return (
    <aside className="site-update-notice" role="status">
      <span>Có bản mới của Nhịp Đội</span>
      <button className="btn primary" type="button" onClick={() => window.location.reload()}>
        Tải bản mới
      </button>
    </aside>
  );
}
