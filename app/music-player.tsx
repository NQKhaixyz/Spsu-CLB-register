"use client";
import { displayMessage } from "../lib/display-message";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, ChevronUp, Maximize2, Minimize2, Minus, Music2, X } from "lucide-react";
import { getSoundCloudTrack, soundCloudLink, type SoundCloudTrack } from "../lib/soundcloud";
import { youtubePlaybackFromLink, youtubeWatchUrl, type YouTubePlayback, type YouTubeVideo } from "../lib/youtube";
import YouTubeEmbed, { type YouTubeEmbedControls } from "./youtube-embed";
import { Button } from "./ui";

const linkOnlyMessage = "Tìm YouTube theo tên chưa bật, hãy dán link nhạc để phát";
const linkHint = "Dán link playlist YouTube để phát lần lượt";
const musicLinkPattern = /https?:\/\/|^(?:[\w-]+\.)+[a-z]{2,}\/|^[a-z][a-z\d+.-]*:\S+$/i;

type Selection =
  | { source: "YouTube"; playback: YouTubePlayback }
  | { source: "SoundCloud"; track: SoundCloudTrack };

export default function MusicPlayer({ obscured }: { obscured: boolean }) {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeVideo[] | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pending, setPending] = useState<"search" | "link" | null>(null);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState(true);
  const [minimized, setMinimized] = useState<"keep-player" | "remove-player" | null>(null);
  const [visible, setVisible] = useState(true);
  const toggle = useRef<HTMLButtonElement>(null);
  const minimizeButton = useRef<HTMLButtonElement>(null);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const youtube = useRef<YouTubeEmbedControls>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    fetch("/api/youtube", { signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<{ available: boolean }> : null)
      .then(result => { if (result && !controller.signal.aborted) setAvailable(result.available); })
      .catch(() => { /* The search request can still report its own status. */ });
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", update);
    };
  }, [open]);

  useEffect(() => () => searchRequest.current?.abort(), []);

  function clearResults() {
    searchRequest.current?.abort();
    searchRequest.current = null;
    setPending(null);
    setResults(null);
    setError("");
  }

  function close() {
    clearResults();
    setOpen(false);
    setSelection(null);
    setQuery("");
    setSelecting(true);
    setMinimized(null);
    toggle.current?.focus();
  }

  function minimize() {
    const keepPlayer = selection?.source !== "YouTube" || youtube.current?.pause();
    setMinimized(keepPlayer ? "keep-player" : "remove-player");
    requestAnimationFrame(() => restoreButton.current?.focus());
  }

  function restore() {
    setMinimized(null);
    requestAnimationFrame(() => minimizeButton.current?.focus());
  }

  function select(next: Selection) {
    setSelection(next);
    setSelecting(false);
    setError("");
  }

  function chooseAnother() {
    setSelection(null);
    setSelecting(true);
    requestAnimationFrame(() => {
      queryInput.current?.focus();
      queryInput.current?.select();
    });
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    clearResults();
    const playback = youtubePlaybackFromLink(term);
    if (playback) {
      select({ source: "YouTube", playback });
      return;
    }
    const link = soundCloudLink(term);
    if (link) {
      const controller = new AbortController();
      searchRequest.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8_000);
      setPending("link");
      try {
        const track = await getSoundCloudTrack(link, controller.signal);
        if (!controller.signal.aborted) select({ source: "SoundCloud", track });
      } catch {
        if (searchRequest.current === controller) {
          setError("SoundCloud chưa mở được link này, thử link chia sẻ của bài hát hoặc playlist công khai");
        }
      } finally {
        window.clearTimeout(timeout);
        if (searchRequest.current === controller) setPending(null);
      }
      return;
    }
    if (musicLinkPattern.test(term)) {
      setError("Dán link YouTube hoặc SoundCloud");
      return;
    }
    if (!term || term.length > 120) {
      setError("Nhập từ khóa từ 1 đến 120 ký tự");
      return;
    }
    if (available === false) {
      setError(linkOnlyMessage);
      return;
    }

    const controller = new AbortController();
    searchRequest.current = controller;
    setPending("search");
    try {
      const response = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: term }),
        signal: controller.signal,
      });
      const result = await response.json() as { videos?: YouTubeVideo[]; error?: string };
      if (controller.signal.aborted) return;
      if (response.status === 503) {
        setAvailable(false);
        throw new Error(linkOnlyMessage);
      }
      if (!response.ok) throw new Error(result.error || "Chưa tìm được video");
      setResults(result.videos ?? []);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Chưa tìm được video");
    } finally {
      if (!controller.signal.aborted) setPending(null);
    }
  }

  const compact = selection !== null && !selecting;
  const showPlayer = minimized !== "remove-player";
  const resizeLabel = compact ? "Mở rộng trình phát" : "Ẩn ô dán link";
  const linkOnly = available === false;
  const source = selection?.source;
  let sourceLink: string | undefined;
  if (selection?.source === "YouTube") sourceLink = youtubeWatchUrl(selection.playback);
  if (selection?.source === "SoundCloud") sourceLink = selection.track.link;
  const linkInput = linkOnly || musicLinkPattern.test(query);
  return (
    <>
      <button
        ref={toggle}
        type="button"
        className={`icon-button music-toggle${selection ? " selected" : ""}`}
        aria-label="Nhạc nền"
        aria-expanded={open && !obscured && !minimized}
        aria-controls={open ? "music-panel-content" : undefined}
        title="Nhạc nền"
        onClick={() => {
          if (minimized) restore();
          else if (open) close();
          else setOpen(true);
        }}
      >
        <Music2 size={19} />
      </button>
      {open && <section
        id="music-panel"
        className={`music-panel${minimized ? " minimized" : compact ? " compact" : ""}${source === "YouTube" ? " youtube" : ""}`}
        aria-label="Nhạc nền"
        hidden={obscured}
        onKeyDown={event => {
          if (event.key === "Escape") {
            if (selection && !compact && !minimized) setSelecting(false);
            else close();
          }
        }}
      >
        {minimized && <div className="music-panel-head music-line">
          <button
            ref={restoreButton}
            type="button"
            className="music-line-open"
            aria-expanded={false}
            aria-controls="music-panel-content"
            title="Mở lại trình phát nhạc"
            onClick={restore}
          >
            <Music2 size={15} aria-hidden="true" />
            <span>{source === "YouTube" ? "YouTube · Tạm dừng" : `Nhạc nền${source ? ` · ${source}` : ""}`}</span>
            <ChevronUp size={15} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" aria-label="Đóng trình phát" title="Đóng trình phát" onClick={close}><X size={16} /></button>
        </div>}
        <div id="music-panel-content" className="music-panel-content" hidden={minimized !== null}>
          <header className="music-panel-head">
            <h2><Music2 size={18} /> {source ?? "Nhạc nền"}</h2>
            <div className="music-panel-buttons">
              {selection && <>
                <a className="icon-button" href={sourceLink} target="_blank" rel="noopener noreferrer" aria-label={`Mở trên ${source}`} title={`Mở trên ${source}`}><ArrowUpRight size={16} /></a>
                <button type="button" className="icon-button" aria-label={resizeLabel} title={resizeLabel} aria-expanded={!compact} onClick={() => setSelecting(compact)}>
                  {compact ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                </button>
              </>}
              <button ref={minimizeButton} type="button" className="icon-button" aria-label="Thu gọn thành một dòng" title="Thu gọn thành một dòng" onClick={minimize}><Minus size={18} /></button>
              <button type="button" className="icon-button" aria-label="Đóng trình phát" title="Đóng trình phát" onClick={close}><X size={18} /></button>
            </div>
          </header>
          {accepted ? (
            <>
              {selection?.source === "YouTube" && visible && !obscured && showPlayer && (
                <YouTubeEmbed key={sourceLink} ref={youtube} playback={selection.playback} onChooseAnother={chooseAnother} />
              )}
              {selection?.source === "SoundCloud" && (
                <iframe key={selection.track.playerUrl} className="music-soundcloud" src={selection.track.playerUrl} title={selection.track.title} referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media" />
              )}
              {selecting && <>
                <form className="music-search" onSubmit={search}>
                  <label htmlFor="music-query">{linkOnly ? "Link YouTube hoặc SoundCloud" : "Tên bài, nghệ sĩ hoặc link nhạc"}</label>
                  <div className="music-search-row">
                    <input id="music-query" ref={queryInput} type="search" value={query} maxLength={350} required placeholder={linkOnly ? "Dán link để phát" : "Ví dụ: Có ai nơi này"} onChange={event => {
                      clearResults();
                      setQuery(event.target.value);
                    }} />
                    <Button type="submit" disabled={pending !== null}>{pending === "link" ? "Đang mở…" : pending === "search" ? "Đang tìm…" : linkInput ? "Mở link" : "Tìm"}</Button>
                  </div>
                </form>
                {!error && <p className="music-message">{linkHint}{linkOnly && <><br />Tìm YouTube theo tên chưa bật</>}</p>}
                {error && <p className="music-error" role="alert">{displayMessage(error)}</p>}
                {results && (results.length ? (
                  <ul className="music-results" aria-label="Kết quả từ YouTube">
                    {results.map(item => <li key={item.id}>
                      <button type="button" onClick={() => select({ source: "YouTube", playback: { videoId: item.id, title: item.title } })}>
                        <strong>{item.title}</strong>
                        {item.channel && <small>{item.channel}</small>}
                      </button>
                    </li>)}
                  </ul>
                ) : <p className="music-message" role="status">Chưa tìm thấy video được phép phát nhúng, thử từ khóa khác nhé</p>)}
              </>}
              {!compact && <details className="music-privacy"><summary>Điều khoản và quyền riêng tư</summary><MusicPrivacy /></details>}
            </>
          ) : (
            <div className="music-privacy">
              <MusicPrivacy />
              <Button onClick={() => setAccepted(true)}>Cho phép tải trình phát</Button>
            </div>
          )}
        </div>
      </section>}
    </>
  );
}

function MusicPrivacy() {
  return <div className="music-privacy-copy">
    <p>Nhịp Đội gửi từ khóa hoặc link nhạc tới YouTube hoặc SoundCloud, các dịch vụ này có thể thu thập dữ liệu thiết bị và lượt phát, dùng cookie hoặc hiển thị quảng cáo, lựa chọn được giữ trong phiên mở trình phát</p>
    <p>Xem điều khoản của <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube</a> và <a href="https://soundcloud.com/terms-of-use" target="_blank" rel="noopener noreferrer">SoundCloud</a>, xem chính sách quyền riêng tư của <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google</a> và <a href="https://soundcloud.com/pages/privacy" target="_blank" rel="noopener noreferrer">SoundCloud</a></p>
  </div>;
}
