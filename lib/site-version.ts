declare global {
  interface ImportMetaEnv {
    readonly VITE_NHIP_BUILD_ID?: string;
  }
}

export const siteVersion = import.meta.env.VITE_NHIP_BUILD_ID ?? "";
export const siteVersionPath = "/api/site-version";
export const siteVersionHeader = "X-Nhip-Build";
