export type SoundCloudTrack = { title: string; link: string; playerUrl: string };

const soundCloudHosts = new Set(["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"]);

export function soundCloudLink(input: string) {
  const link = input.trim();
  try {
    const url = new URL(link.includes("://") ? link : `https://${link}`);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.port || url.username || url.password) return null;
    if (url.hostname === "on.soundcloud.com" && /^\/[\w-]+\/?$/.test(url.pathname)) {
      return `https://on.soundcloud.com${url.pathname}`;
    }
    if (soundCloudHosts.has(url.hostname) && /^\/[^/]+\/(?:sets\/)?[^/]+\/?$/.test(url.pathname)) {
      return `https://soundcloud.com${url.pathname}`;
    }
  } catch {
    // The caller may be entering a song name rather than a URL.
  }
  return null;
}

export async function getSoundCloudTrack(link: string, signal: AbortSignal): Promise<SoundCloudTrack> {
  const params = new URLSearchParams({ format: "json", url: link });
  const response = await fetch(`https://soundcloud.com/oembed?${params}`, {
    credentials: "omit",
    redirect: "error",
    signal,
  });
  if (!response.ok) throw new Error("SoundCloud could not resolve the link");

  const data = await response.json() as { html?: string; title?: string };
  // Extract the resource from the widget URL without inserting provider HTML.
  const src = data.html?.match(/\bsrc=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/gi, "&");
  const widget = src ? new URL(src) : null;
  const resource = widget?.searchParams.get("url") ?? "";
  const path = resource.match(/^https?:\/\/api\.soundcloud\.com\/(tracks|playlists)\/\d+\/?$/)?.[0];
  if (widget?.origin !== "https://w.soundcloud.com" || widget.pathname !== "/player/" || !path) {
    throw new Error("SoundCloud did not return a track or playlist");
  }
  const options = new URLSearchParams({
    url: path.replace(/^http:/, "https:"),
    visual: "false",
    show_artwork: "false",
  });
  return { title: data.title || "Bài nhạc SoundCloud", link, playerUrl: `https://w.soundcloud.com/player/?${options}` };
}
