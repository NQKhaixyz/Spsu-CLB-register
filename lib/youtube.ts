const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const playlistIdPattern = /^[A-Za-z0-9_-]{2,100}$/;
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);

export type YouTubeVideo = { id: string; title: string; channel: string };
export type YouTubePlayback = { title: string } & (
  { videoId: string; playlistId?: string } | { videoId?: undefined; playlistId: string }
);

export function youtubePlaybackFromLink(input: string): YouTubePlayback | null {
  const link = input.trim();
  let url: URL;
  try {
    url = new URL(link.includes("://") ? link : `https://${link}`);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.port) return null;

  const path = url.pathname.replace(/\/$/, "");
  const youtube = youtubeHosts.has(url.hostname);
  const embedHost = youtube || url.hostname === "www.youtube-nocookie.com";
  let id: string | null = null;
  if (url.hostname === "youtu.be") {
    id = path.slice(1);
  } else if (youtube && path === "/watch") {
    id = url.searchParams.get("v");
  } else if (embedHost && path !== "/embed/videoseries") {
    id = path.match(/^\/(?:shorts|live|embed)\/([^/]+)$/)?.[1] ?? null;
  }
  const videoId = id && videoIdPattern.test(id) ? id : undefined;
  const playlistId = url.searchParams.get("list");
  if (playlistId && playlistIdPattern.test(playlistId) && (
    videoId || (youtube && path === "/playlist") || (embedHost && path === "/embed/videoseries")
  )) {
    return { videoId, playlistId, title: "Playlist YouTube" };
  }
  return videoId ? { videoId, title: "Video YouTube" } : null;
}

export function youtubeWatchUrl({ videoId, playlistId }: YouTubePlayback) {
  const url = new URL(videoId ? "/watch" : "/playlist", "https://www.youtube.com");
  if (videoId) url.searchParams.set("v", videoId);
  if (playlistId) url.searchParams.set("list", playlistId);
  return url.href;
}

export function youtubeEmbedUrl({ videoId, playlistId }: YouTubePlayback, origin: string) {
  const params = new URLSearchParams({ playsinline: "1", enablejsapi: "1", origin });
  if (playlistId) {
    params.set("listType", "playlist");
    params.set("list", playlistId);
  }
  return `https://www.youtube-nocookie.com/embed/${videoId ?? "videoseries"}?${params}`;
}

export async function searchYouTube(query: string, key: string) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: query,
    maxResults: "10",
    regionCode: "VN",
    relevanceLanguage: "vi",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    fields: "items(id/videoId,snippet(title,channelTitle))",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
      headers: { "X-Goog-Api-Key": key },
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { errors?: { reason?: string }[] } } | null;
      const limitReached = response.status === 429 || body?.error?.errors?.some(({ reason }) =>
        reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "rateLimitExceeded",
      );
      return { status: limitReached ? 429 : response.status };
    }

    const { items = [] } = await response.json() as {
      items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }>;
    };
    const videos: YouTubeVideo[] = items.flatMap(({ id, snippet }) => {
      if (!id?.videoId || !videoIdPattern.test(id.videoId) || !snippet?.title) return [];
      return [{ id: id.videoId, title: snippet.title, channel: snippet.channelTitle ?? "" }];
    });
    return { videos };
  } finally {
    clearTimeout(timeout);
  }
}
