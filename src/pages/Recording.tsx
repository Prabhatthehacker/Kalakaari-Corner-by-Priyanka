import { useParams } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { videoDetails } from "@/lib/video";

export default function Recording() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, loading } = useAuth();
  const query = trpc.classroom.recordings.useQuery(undefined, { enabled: isAuthenticated });
  const lesson = query.data?.find(item => String(item.id) === id);

  if (loading || query.isLoading) return <div className="app-loading"><span>Opening the recording…</span></div>;
  if (!isAuthenticated) return <div className="app-loading"><button className="button button-ink" onClick={() => startLogin()}>Sign in to watch</button></div>;
  if (!lesson) return <div className="app-loading"><span>Recording not found.</span></div>;

  const source = videoDetails(lesson.videoUrl);
  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px" }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: 16 }}>{lesson.title}</h1>
      <div style={{ width: "100%", maxWidth: 1100, aspectRatio: "16 / 9" }}>
        {source.kind === "video" ? (
          <video src={source.src} controls playsInline autoPlay style={{ width: "100%", height: "100%" }} />
        ) : source.kind === "embed" ? (
          <iframe src={source.src} title={lesson.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{ width: "100%", height: "100%", border: 0 }} />
        ) : (
          <a className="button button-ink" href={source.src} target="_blank" rel="noreferrer">Open recording</a>
        )}
      </div>
      <p style={{ marginTop: 16, opacity: 0.8 }}>{lesson.category}{lesson.description ? ` · ${lesson.description}` : ""}</p>
    </div>
  );
}
