export function videoDetails(link: string) {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? { kind: "embed" as const, src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` } : { kind: "external" as const, src: link };
    }
    if (host.endsWith("youtube.com")) {
      const id = url.pathname.includes("/embed/") ? url.pathname.split("/embed/")[1]?.split("/")[0] : url.searchParams.get("v");
      return id ? { kind: "embed" as const, src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` } : { kind: "external" as const, src: link };
    }
    if (host.endsWith("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? { kind: "embed" as const, src: `https://player.vimeo.com/video/${id}?dnt=1` } : { kind: "external" as const, src: link };
    }
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url.pathname + url.search)) {
      return { kind: "video" as const, src: link };
    }
    return { kind: "external" as const, src: link };
  } catch {
    return { kind: "external" as const, src: link };
  }
}
