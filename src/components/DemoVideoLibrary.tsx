import { useState, type FormEvent } from "react";
import { Archive, Check, Film, Pencil, Play, Plus, Save, Upload, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { videoDetails } from "@/lib/video";
import "@/pages/demo-videos.css";

type DemoVideo = {
  id: number;
  title: string;
  description: string;
  videoUrl: string;
  status: "published" | "archived";
  createdAt: Date | string;
};

export default function DemoVideoLibrary({ isTeacher }: { isTeacher: boolean }) {
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const utils = trpc.useUtils();
  const videosQuery = trpc.classroom.demoVideos.useQuery();
  const teacherQuery = trpc.classroom.teacherDemoVideos.useQuery(undefined, { enabled: isTeacher });
  const updateVideo = trpc.classroom.updateDemoVideo.useMutation({ onSuccess: async () => {
    await Promise.all([utils.classroom.demoVideos.invalidate(), utils.classroom.teacherDemoVideos.invalidate()]);
    setEditing(null);
    setMessage("Demo lesson details updated.");
  } });
  const archiveVideo = trpc.classroom.archiveDemoVideo.useMutation({ onSuccess: async () => {
    await Promise.all([utils.classroom.demoVideos.invalidate(), utils.classroom.teacherDemoVideos.invalidate()]);
    setMessage("The lesson was removed from the student library.");
  } });

  const teacherVideos = (teacherQuery.data ?? []) as DemoVideo[];
  const visibleVideos = isTeacher ? teacherVideos.filter(video => video.status === "published") : (videosQuery.data ?? []) as DemoVideo[];

  const addVideo = trpc.classroom.addDemoVideo.useMutation();

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!videoUrl.trim() || !title.trim()) { setError("Add a title and a video link before publishing."); return; }
    setUploading(true);
    setError("");
    setMessage("");
    try {
      await addVideo.mutateAsync({ title: title.trim(), description: description.trim(), videoUrl: videoUrl.trim() });
      await Promise.all([utils.classroom.demoVideos.invalidate(), utils.classroom.teacherDemoVideos.invalidate()]);
      setTitle(""); setDescription(""); setVideoUrl(""); setShowUpload(false);
      setMessage("Your demo video is published and ready for students.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The video could not be published. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function beginEdit(video: DemoVideo) {
    setEditing(video.id);
    setEditTitle(video.title);
    setEditDescription(video.description);
    setError("");
  }

  function saveEdit(event: FormEvent, id: number) {
    event.preventDefault();
    if (!editTitle.trim()) { setError("A lesson title is required."); return; }
    updateVideo.mutate({ id, title: editTitle.trim(), description: editDescription.trim() });
  }

  return (
    <section className="demo-library" aria-label="Demonstration videos">
      <div className="demo-library-heading">
        <div><span className="eyebrow">LEARN A NEW LITTLE THING</span><h2>Demo class videos</h2><p>Short demonstrations from Priyanka’s studio.</p></div>
        {isTeacher && <button type="button" className="button button-ink" onClick={() => { setShowUpload(value => !value); setError(""); }}><Plus size={16} /> Add a demo</button>}
      </div>

      {message && <div className="demo-status" role="status"><Check size={16} />{message}</div>}
      {error && <p className="inline-error" role="alert">{error}</p>}

      {isTeacher && showUpload && <form className="demo-upload-form" onSubmit={publish}>
        <div className="form-heading"><div><span className="eyebrow">SHARE A DEMONSTRATION</span><h3>Add a link and publish</h3></div><button className="icon-button" type="button" onClick={() => setShowUpload(false)} aria-label="Close upload form"><X size={16} /></button></div>
        <label>Video title<input value={title} onChange={event => setTitle(event.target.value)} maxLength={140} placeholder="e.g. Mixing soft watercolor greens" required /></label>
        <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={3} placeholder="What will students learn in this demonstration?" /></label>
        <label>Video link<input value={videoUrl} onChange={event => setVideoUrl(event.target.value)} placeholder="https://youtu.be/... or a direct .mp4 link" required /></label>
        <p className="demo-upload-help">Paste a YouTube, Vimeo, or direct MP4/WebM link (https only).</p>
        <button className="button button-ochre" type="submit" disabled={uploading || !videoUrl.trim()}>{uploading ? <><Upload size={16} /> Publishing…</> : <><Upload size={16} /> Publish demo video</>}</button>
      </form>}

      {isTeacher && teacherQuery.isLoading ? <div className="demo-library-empty">Loading your demonstration videos…</div>
        : !isTeacher && videosQuery.isLoading ? <div className="demo-library-empty">Gathering demo lessons…</div>
        : (isTeacher ? teacherQuery.isError : videosQuery.isError) ? <div className="demo-library-empty" role="alert">The demo library is unavailable right now. Please refresh and try again.</div>
        : visibleVideos.length === 0 ? <div className="demo-library-empty"><Film size={25} /><strong>No demonstration videos yet.</strong><span>{isTeacher ? "Upload your first short lesson and students will find it here." : "Priyanka will add demonstrations here soon."}</span></div>
        : <div className="demo-video-grid">{visibleVideos.map(video => (
          <article className="demo-video-card" key={video.id}>
            {editing === video.id ? <form className="demo-edit-form" onSubmit={event => saveEdit(event, video.id)}>
              <label>Title<input value={editTitle} onChange={event => setEditTitle(event.target.value)} maxLength={140} required /></label>
              <label>Description<textarea value={editDescription} onChange={event => setEditDescription(event.target.value)} maxLength={2000} rows={3} /></label>
              <div className="demo-card-actions"><button className="button button-ink button-small" type="submit" disabled={updateVideo.isPending}><Save size={14} /> Save</button><button className="text-link" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
            </form> : <>
              <div className="demo-video-frame">{(() => { const s = videoDetails(video.videoUrl); return s.kind === "embed" ? <iframe src={s.src} title={video.title} allow="encrypted-media; picture-in-picture" allowFullScreen style={{ width: "100%", height: "100%", border: 0 }} /> : s.kind === "video" ? <video src={s.src} controls preload="metadata" playsInline aria-label={video.title} /> : <a className="button button-ink" href={s.src} target="_blank" rel="noreferrer">Open video</a>; })()}<span className="demo-video-badge"><Play size={12} fill="currentColor" /> DEMO</span></div>
              <div className="demo-video-copy"><time>{new Date(video.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</time><h3>{video.title}</h3><p>{video.description || "A demonstration from Priyanka’s art studio."}</p></div>
              {isTeacher && <div className="demo-card-actions"><button className="text-link" type="button" onClick={() => beginEdit(video)}><Pencil size={14} /> Edit details</button><button className="text-link demo-archive-action" type="button" onClick={() => { if (window.confirm("Remove this video from the student library?")) archiveVideo.mutate({ id: video.id }); }} disabled={archiveVideo.isPending}><Archive size={14} /> Remove</button></div>}
            </>}
          </article>
        ))}</div>}
    </section>
  );
}
