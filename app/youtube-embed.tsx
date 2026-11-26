"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { youtubeEmbedUrl, type YouTubePlayback } from "../lib/youtube";

export type YouTubeEmbedControls = { pause(): boolean };

type Player = { destroy(): void; pauseVideo(): void };
type YouTubeAPI = {
  Player: new (iframe: HTMLIFrameElement, options: {
    events: {
      onReady: (event: { target: Player }) => void;
      onError: (event: { data: number }) => void;
      onStateChange: (event: { data: number }) => void;
    };
  }) => Player;
};
type YouTubeWindow = Window & {
  YT?: YouTubeAPI;
  onYouTubeIframeAPIReady?: () => void;
};

let iframeAPI: Promise<YouTubeAPI> | undefined;

function loadIframeAPI() {
  const host = window as YouTubeWindow;
  if (host.YT?.Player) return Promise.resolve(host.YT);
  iframeAPI ??= new Promise<YouTubeAPI>((resolve, reject) => {
    const script = document.createElement("script");
    const previous = host.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(fail, 8_000);

    function cleanup() {
      window.clearTimeout(timeout);
      if (host.onYouTubeIframeAPIReady === ready) host.onYouTubeIframeAPIReady = previous;
    }
    function fail() {
      cleanup();
      script.remove();
      iframeAPI = undefined;
      reject(new Error("YouTube iframe API unavailable"));
    }
    function ready() {
      const api = host.YT;
      if (!api?.Player) return fail();
      cleanup();
      resolve(api);
      previous?.();
    }
    host.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return iframeAPI;
}

const playbackErrors: Record<number, string> = {
  100: "Video đã bị xóa hoặc đặt ở chế độ riêng tư. Chọn video khác nhé.",
  101: "YouTube không cho phát video này trên Nhịp Đội.",
  150: "YouTube không cho phát video này trên Nhịp Đội.",
  153: "YouTube không nhận diện được trang trong trình duyệt này. Mở video trên YouTube để xem.",
};

export default function YouTubeEmbed({ playback, onChooseAnother, ref }: {
  playback: YouTubePlayback;
  onChooseAnother: () => void;
  ref: Ref<YouTubeEmbedControls>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const readyPlayer = useRef<Player | null>(null);
  const [error, setError] = useState("");

  useImperativeHandle(ref, () => ({
    pause() {
      if (!readyPlayer.current) return false;
      readyPlayer.current.pauseVideo();
      return true;
    },
  }), []);

  useEffect(() => {
    const mount = container.current;
    if (!mount) return;

    let stopped = false;
    let player: Player | undefined;
    const iframe = document.createElement("iframe");
    iframe.className = "music-video";
    iframe.src = youtubeEmbedUrl(playback, window.location.origin);
    iframe.title = playback.title;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "autoplay; encrypted-media; fullscreen; web-share";
    iframe.allowFullscreen = true;
    mount.appendChild(iframe);

    void loadIframeAPI().then(api => {
      if (stopped) return;
      player = new api.Player(iframe, {
        events: {
          onReady: ({ target }) => {
            if (!stopped) readyPlayer.current = target;
          },
          onError: ({ data }) => {
            if (stopped) return;
            if (playback.playlistId) {
              setError("YouTube chưa phát được mục này. Hãy thử bài tiếp theo trong trình phát hoặc mở playlist trên YouTube.");
            } else {
              setError(playbackErrors[data] ?? "Video này chưa phát được. Bạn thử chọn video khác nhé.");
            }
          },
          onStateChange: ({ data }) => {
            if (!stopped && data === 1) setError("");
          },
        },
      });
    }).catch(() => {
      // The native iframe still works when the optional error API cannot load.
    });

    return () => {
      stopped = true;
      readyPlayer.current = null;
      player?.destroy();
      iframe.remove();
    };
  }, [playback]);

  return <div>
    <div ref={container} />
    {error && <div className="music-playback-error">
      <p className="music-error" role="alert">{error}</p>
      <button type="button" className="btn secondary" onClick={onChooseAnother}>Đổi video hoặc link</button>
    </div>}
  </div>;
}
