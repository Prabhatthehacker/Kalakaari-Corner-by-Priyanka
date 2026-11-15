import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Home as HomeIcon,
  LogOut,
  MessageCircle,
  Paintbrush,
  Play,
  Plus,
  Send,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { videoDetails } from "@/lib/video";
import { trpc } from "@/lib/trpc";
import ArtfulCorner from "@/components/ArtfulCorner";
import LiveSchedule from "@/components/LiveSchedule";
import DemoVideoLibrary from "@/components/DemoVideoLibrary";

const HERO_ART = `${import.meta.env.BASE_URL}hero.svg`;

type View = "home" | "classes" | "recordings" | "demo" | "chat";
type Lesson = {
  id: number;
  title: string;
  category: string;
  description: string;
  videoUrl: string;
  createdAt: Date;
};
type Message = {
  id: number;
  senderOpenId: string;
  senderName: string;
  body: string;
  createdAt: Date;
};

const demoSteps = [
  {
    kicker: "01 · FIND YOUR SHAPE",
    title: "Begin with a light outline",
    copy: "Notice the long curve of a leaf. Sketch it softly, letting your wrist make one easy, flowing movement.",
    note: "Keep your pencil light — you can always add more later.",
  },
  {
    kicker: "02 · MIX YOUR COLOUR",
    title: "Let the pigments meet",
    copy: "Bring together a little yellow and blue-green. Add water until the colour feels like a fresh spring leaf.",
    note: "Try your colour on a scrap of paper first.",
  },
  {
    kicker: "03 · ADD A LITTLE LIFE",
    title: "Finish with a fine brush",
    copy: "Lay in the wash, leave a few bright spaces, then draw delicate veins once the paint is almost dry.",
    note: "Every leaf is a little different. That is the lovely part.",
  },
];

function scrollToDemo() {
  document.getElementById("demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleLogin(onError: (message: string) => void) {
  try {
    startLogin();
  } catch {
    onError("Sign-in is not available right now. Please try again shortly.");
  }
}

function BrandMark({ light = false }: { light?: boolean }) {
  return <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" aria-hidden="true" style={{ height: light ? 52 : 56, width: "auto", display: "block" }} />;
}

function Header({
  signedIn,
  name,
  onLogin,
  onLogout,
  onView,
}: {
  signedIn: boolean;
  name?: string;
  onLogin: () => void;
  onLogout: () => void;
  onView?: (view: View, section?: string) => void;
}) {
  return (
    <header className="site-header">
      <a className="brand-lockup" href="#top" aria-label="Kalakaari Corner by Priyanka home">
        <BrandMark />
        <span className="brand-name">
          <strong>Kalakaari Corner</strong>
          <small>by Priyanka</small>
        </span>
      </a>
      {signedIn ? (
        <>
          <nav className="main-nav signed-nav" aria-label="Classroom navigation">
            <button type="button" onClick={() => onView?.("home")}><HomeIcon size={15} /> Home</button>
            <button type="button" onClick={() => onView?.("classes")}>My classes</button>
            <button type="button" onClick={() => onView?.("demo")}>Demo class</button>
            <button type="button" onClick={() => onView?.("recordings")}>Recordings</button>
            <button type="button" onClick={() => onView?.("chat")}>Class chat</button>
          </nav>
          <div className="header-actions">
            <span className="header-greeting">Namaste, {name?.split(" ")[0] || "artist"}</span>
            <button className="icon-button signout-button" type="button" onClick={onLogout} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </>
      ) : (
        <>
          <nav className="main-nav" aria-label="Main navigation">
            <a href="#studio">The studio</a>
            <a href="#demo">Demo class</a>
          </nav>
          <button className="button button-ink button-small" type="button" onClick={onLogin}>
            Sign in <ArrowUpRight size={15} />
          </button>
        </>
      )}
    </header>
  );
}

function DemoLesson({ step, setStep }: { step: number; setStep: (value: number) => void }) {
  const current = demoSteps[step];
  return (
    <div className="demo-card">
      <div className="demo-artboard" style={{ backgroundImage: `url(${HERO_ART})` }}>
        <div className="demo-art-tint" />
        <div className="demo-play-badge"><Play size={17} fill="currentColor" /></div>
        <div className="demo-art-caption"><Sparkles size={14} /> A little botanical study</div>
        <div className="demo-step-count">0{step + 1} <span>/ 03</span></div>
      </div>
      <div className="demo-instructions">
        <div className="demo-kicker">{current.kicker}</div>
        <h3>{current.title}</h3>
        <p>{current.copy}</p>
        <div className="demo-note"><Paintbrush size={16} /><span>{current.note}</span></div>
        <div className="demo-controls">
          <div className="demo-dots" aria-label={`Step ${step + 1} of 3`}>
            {demoSteps.map((_, i) => (
              <button
                type="button"
                key={i}
                className={`demo-dot${step === i ? " is-active" : ""}`}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
          {step < demoSteps.length - 1 ? (
            <button className="button button-ink button-small" type="button" onClick={() => setStep(step + 1)}>
              Next step <ArrowRight size={15} />
            </button>
          ) : (
            <button className="button button-ink button-small" type="button" onClick={() => setStep(0)}>
              Start again <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

async function saveVideoFile(url: string, title: string) {
  const extension = (new URL(url).pathname.match(/\.(mp4|webm|ogg|mov)$/i)?.[1] ?? "mp4").toLowerCase();
  const name = `${title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80) || "kalakaari-class"}.${extension}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("The video could not be downloaded.");
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

function RecordingPlayer({ lesson, close }: { lesson: Lesson; close: () => void }) {
  const source = videoDetails(lesson.videoUrl);
  const [downloading, setDownloading] = useState(false);
  const [downloadNote, setDownloadNote] = useState("");
  async function download() {
    setDownloading(true);
    setDownloadNote("");
    try {
      await saveVideoFile(lesson.videoUrl, lesson.title);
    } catch {
      // Some hosts don't allow a direct save from the page; open the file so it can still be saved.
      window.open(lesson.videoUrl, "_blank", "noopener,noreferrer");
      setDownloadNote("Your browser couldn’t save it directly, so the video opened in a new tab. Press and hold it (or use the ⋮ menu) to save.");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="modal-scrim" role="presentation" onMouseDown={event => event.target === event.currentTarget && close()}>
      <section className="video-modal" role="dialog" aria-modal="true" aria-labelledby="video-title">
        <div className="video-modal-top">
          <div><span className="eyebrow">CLASS REPLAY</span><h2 id="video-title">{lesson.title}</h2></div>
          <button className="icon-button" type="button" onClick={close} aria-label="Close video"><X size={19} /></button>
        </div>
        <div className="video-frame">
          {source.kind === "video" ? (
            <video src={source.src} controls playsInline autoPlay />
          ) : source.kind === "embed" ? (
            <iframe src={source.src} title={lesson.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          ) : (
            <div className="external-video-card">
              <Video size={28} />
              <p>This recording is hosted outside the classroom.</p>
              <a className="button button-ink" href={source.src} target="_blank" rel="noreferrer">Open recording <ArrowUpRight size={16} /></a>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 4px" }}>
          {source.kind === "video" && <button className="button button-ochre" type="button" onClick={() => void download()} disabled={downloading}>{downloading ? "Downloading…" : "Download video"}</button>}
          <a className="button button-paper" href={`https://wa.me/?text=${encodeURIComponent(`Kalakaari Corner class recording: ${lesson.title}\n${lesson.videoUrl}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
        </div>
        {downloadNote && <p className="inline-error" role="status">{downloadNote}</p>}
        <p className="modal-footnote">Shared by Priyanka · {lesson.category}{lesson.description ? ` · ${lesson.description}` : ""}</p>
      </section>
    </div>
  );
}

function RecordingForm({
  onSave,
  pending,
  onCancel,
}: {
  onSave: (input: { title: string; category: string; description: string; videoUrl: string }) => void;
  pending: boolean;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Watercolour");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const url = new URL(videoUrl);
      if (url.protocol !== "https:") throw new Error();
    } catch {
      setError("Add a complete HTTPS link to a hosted recording.");
      return;
    }
    if (!title.trim()) {
      setError("Give this class a title first.");
      return;
    }
    setError("");
    onSave({ title: title.trim(), category: category.trim() || "Art class", description: description.trim(), videoUrl: videoUrl.trim() });
  }
  return (
    <form className="recording-form" onSubmit={submit}>
      <div className="form-heading"><div><span className="eyebrow">SHARE A REPLAY</span><h3>Add a class recording</h3></div><button className="icon-button" type="button" onClick={onCancel} aria-label="Close form"><X size={17} /></button></div>
      <label>Class title<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Watercolour botanicals" maxLength={140} required /></label>
      <label>What students will learn<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a short description of the class…" maxLength={2000} rows={2} /></label>
      <div className="form-row">
        <label>Topic<input value={category} onChange={e => setCategory(e.target.value)} placeholder="Watercolour" maxLength={60} /></label>
        <label>Video link<input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://files.catbox.moe/…mp4" required /></label>
      </div>
      <p className="form-help">Upload the video to catbox.moe first, then paste its direct link here (it looks like https://files.catbox.moe/abc123.mp4). YouTube and Vimeo links work too.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="button button-ink" type="submit" disabled={pending}>{pending ? "Saving…" : "Add to my classes"} {!pending && <ArrowRight size={16} />}</button>
    </form>
  );
}

function ChatPanel({
  messages,
  loading,
  error,
  userOpenId,
  draft,
  onDraftChange,
  onSend,
  sending,
}: {
  messages: Message[];
  loading: boolean;
  error?: string;
  userOpenId: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (event: FormEvent) => void;
  sending: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);
  return (
    <section className="chat-panel" aria-label="Class chat">
      <div className="chat-heading">
        <div className="chat-avatar"><MessageCircle size={19} /></div>
        <div><span className="eyebrow">THE CLASSROOM</span><h2>Class chat</h2><p>A little space to ask, share, and learn together.</p></div>
        <span className="online-note"><span /> Class room</span>
      </div>
      <div className="chat-messages" aria-live="polite">
        {loading ? <div className="chat-empty">Opening the conversation…</div> : messages.length === 0 ? (
          <div className="chat-empty"><div className="empty-spark"><MessageCircle size={22} /></div><strong>Start the conversation</strong><p>Ask Priyanka a question or share what you’re working on.</p></div>
        ) : messages.map(message => {
          const own = message.senderOpenId === userOpenId;
          const timestamp = new Date(message.createdAt);
          return <article className={`chat-message${own ? " own-message" : ""}`} key={message.id}>
            <div className="message-avatar">{(message.senderName || "A").trim().slice(0, 1).toUpperCase()}</div>
            <div className="message-content"><div className="message-byline"><strong>{own ? "You" : message.senderName}</strong><time>{timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div><p>{message.body}</p></div>
          </article>;
        })}
        {error && <p className="inline-error chat-error" role="alert">{error}</p>}
        <div ref={endRef} />
      </div>
      <form className="chat-composer" onSubmit={onSend}>
        <label className="sr-only" htmlFor="chat-message">Write a message</label>
        <textarea id="chat-message" value={draft} onChange={event => onDraftChange(event.target.value)} placeholder="Write a message…" maxLength={1000} rows={1} />
        <button className="send-button" type="submit" disabled={!draft.trim() || sending} aria-label="Send message"><Send size={17} /></button>
      </form>
      <div className="chat-composer-note">Be kind, stay curious. Your messages are shared with the class.</div>
    </section>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [view, setView] = useState<View>("home");
  const [demoStep, setDemoStep] = useState(0);
  const [showRecordingForm, setShowRecordingForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [draft, setDraft] = useState("");
  const [loginError, setLoginError] = useState("");
  const [successNote, setSuccessNote] = useState("");
  const utils = trpc.useUtils();
  const teacherQuery = trpc.classroom.isTeacher.useQuery(undefined, { enabled: isAuthenticated, staleTime: 60_000 });
  const isTeacher = Boolean(teacherQuery.data);
  const recordingsQuery = trpc.classroom.recordings.useQuery(undefined, { enabled: isAuthenticated, staleTime: 30_000 });
  const liveClassesQuery = trpc.classroom.liveClasses.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: isAuthenticated ? 15_000 : false });
  const messagesQuery = trpc.classroom.messages.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: isAuthenticated && view === "chat" ? 8_000 : false,
  });
  const addRecording = trpc.classroom.addRecording.useMutation({
    onSuccess: async () => {
      await utils.classroom.recordings.invalidate();
      setShowRecordingForm(false);
      setSuccessNote("Your recording link is ready for the class.");
      window.setTimeout(() => setSuccessNote(""), 3500);
    },
  });
  const sendMessage = trpc.classroom.sendMessage.useMutation({
    onSuccess: async () => {
      setDraft("");
      await utils.classroom.messages.invalidate();
    },
  });
  const scheduleLiveClass = trpc.classroom.scheduleLiveClass.useMutation({
    onSuccess: async () => { await liveClassesQuery.refetch(); setShowScheduleForm(false); },
  });
  const startLiveClass = trpc.classroom.startLiveClass.useMutation({
    onSuccess: async () => { await liveClassesQuery.refetch(); },
  });

  function openClass(id: number) {
    window.location.hash = `/class/${id}`;
  }
  function joinOrStart(id: number) {
    const item = (liveClassesQuery.data || []).find((entry: { id: number }) => entry.id === id);
    // Students (and anyone joining a class that is already live) go straight in.
    if (!item || item.status === "live" || item.hostOpenId !== user?.openId) { openClass(id); return; }
    startLiveClass.mutate({ id }, { onSuccess: () => openClass(id) });
  }

  function doLogout() {
    void logout().catch(() => setLoginError("We couldn’t sign you out just now. Please try again."));
  }
  function changeView(next: View, section?: string) {
    setView(next);
    setLoginError("");
    if (section) window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function saveRecording(input: { title: string; category: string; description: string; videoUrl: string }) {
    addRecording.mutate(input);
  }
  function submitMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (body && !sendMessage.isPending) sendMessage.mutate({ body });
  }

  if (loading) {
    return <div className="app-loading"><BrandMark /><span>Opening the studio…</span></div>;
  }

  const signedIn = Boolean(isAuthenticated && user);
  return (
    <div className="site-shell" id="top">
      <Header
        signedIn={signedIn}
        name={user?.name || undefined}
        onLogin={() => handleLogin(setLoginError)}
        onLogout={doLogout}
        onView={changeView}
      />
      {loginError && <div className="top-alert" role="alert">{loginError}<button type="button" onClick={() => setLoginError("")} aria-label="Dismiss"><X size={15} /></button></div>}

      {!signedIn ? (
        <>
          <main>
            <section className="hero-section">
              <div className="hero-copy">
                <div className="eyebrow hero-eyebrow"><span className="eyebrow-dot" /> AN ONLINE ART STUDIO</div>
                <h1>Make room for <em>a little colour.</em></h1>
                <p className="hero-intro">Thoughtful art classes with professional artist Priyanka. Pick up a brush, find your rhythm, and make something that feels like you.</p>
                <div className="hero-actions">
                  <button className="button button-ochre" type="button" onClick={scrollToDemo}>Try the demo class <ArrowRight size={17} /></button>
                  <button className="text-link" type="button" onClick={() => handleLogin(setLoginError)}>I’m already a student <ChevronRight size={16} /></button>
                </div>
                <div className="hero-proof"><div className="proof-avatars"><span>P</span><span>✦</span><span>500</span></div><p><strong>500+ students</strong><br />have learned with Priyanka</p></div>
              </div>
              <div className="hero-visual">
                <ArtfulCorner className="hero-artful-decoration" />
                <div className="hero-image-frame"><img src={HERO_ART} alt="Watercolour paints and a botanical art study on handmade paper" /></div>
                <div className="image-stamp"><span>LEARN</span><i>·</i><span>MAKE</span><i>·</i><span>GROW</span></div>
                <div className="hero-caption"><span className="caption-mark">✳</span><span>Creativity, one brushstroke at a time</span></div>
                <span className="paint-orbit orbit-one" /><span className="paint-orbit orbit-two" />
              </div>
            </section>
            <section className="studio-strip" id="studio">
              <div className="strip-item"><span className="strip-icon"><Paintbrush size={19} /></span><div><strong>Learn by making</strong><small>Gentle, step-by-step lessons</small></div></div>
              <span className="strip-divider" />
              <div className="strip-item"><span className="strip-icon"><Users size={19} /></span><div><strong>A welcoming studio</strong><small>For curious artists at every level</small></div></div>
              <span className="strip-divider" />
              <div className="strip-item"><span className="strip-icon"><BookOpen size={19} /></span><div><strong>Learn at your pace</strong><small>Revisit class recordings anytime</small></div></div>
            </section>
            <section className="about-section">
              <div className="about-mark"><BrandMark /><span>ARTIST<br />& TEACHER</span></div>
              <div className="about-copy"><span className="eyebrow">A LITTLE ABOUT THE STUDIO</span><h2>Art feels better<br />when we make it <em>together.</em></h2></div>
              <div className="about-note"><p>Kalakaari celebrates art and artists — a welcoming corner to learn, make, and share art. Priyanka is a professional artist who has taught more than 500 students.</p><a href="#demo" className="inline-arrow">Come see for yourself <ArrowDown size={15} /></a></div>
            </section>
            <section className="demo-section" id="demo">
              <div className="section-heading"><div><span className="eyebrow">A FIRST TASTE</span><h2>Try a little <em>art together.</em></h2></div><p>A gentle, self-guided sample lesson. No sign-in needed.</p></div>
              <DemoLesson step={demoStep} setStep={setDemoStep} />
            </section>
            <section className="sign-in-banner">
              <div><span className="eyebrow">YOUR CREATIVE CORNER</span><h2>Already part of the class?</h2><p>Sign in to find your recordings and chat with Priyanka.</p></div>
              <button className="button button-paper" type="button" onClick={() => handleLogin(setLoginError)}>Sign in to your classes <ArrowRight size={16} /></button>
            </section>
          </main>
          <footer className="site-footer"><a className="brand-lockup" href="#top"><BrandMark light /><span className="brand-name"><strong>Kalakaari Corner</strong><small>by Priyanka</small></span></a><span>Made with a little colour and a lot of heart.</span><a href="#top">Back to top ↑</a></footer>
        </>
      ) : (
        <main className="classroom-main">
          {view === "home" && (
            <>
              <div className="classroom-welcome">
                <ArtfulCorner className="workspace-artful-decoration" />
                <div className="classroom-welcome-copy"><span className="eyebrow">YOUR CREATIVE CORNER</span><h1>{`Good to see you${user?.name ? `, ${user.name.split(" ")[0]}` : ""}.`}</h1><p>Take your time. There’s always something new to discover.</p></div>
                <div className="classroom-welcome-art" aria-hidden="true"><img src={HERO_ART} alt="" /></div>
                <div className="welcome-stat"><span className="welcome-stat-icon"><Sparkles size={19} /></span><div><strong>500+</strong><small>students inspired</small></div></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, margin: "18px 0" }}>
                {([
                  ["classes", "My classes", "See upcoming live classes and join with one tap."],
                  ["recordings", "Recordings", "Watch, download and share past classes."],
                  ["demo", "Demo class", "A short guided sample lesson."],
                  ["chat", "Class chat", "Say hello to Priyanka and the class."],
                ] as [View, string, string][]).map(([target, label, text]) => (
                  <button key={target} type="button" className="recording-card" onClick={() => changeView(target)} style={{ textAlign: "left", padding: 18 }}>
                    <strong style={{ display: "block", fontSize: "1.1rem", marginBottom: 6 }}>{label}</strong>
                    <span style={{ opacity: .75 }}>{text}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {view === "classes" && (
            <LiveSchedule
              classes={liveClassesQuery.data || []}
              loading={liveClassesQuery.isLoading}
              error={liveClassesQuery.isError}
              isTeacher={isTeacher}
              userOpenId={user?.openId ?? ""}
              showForm={showScheduleForm}
              onToggleForm={() => setShowScheduleForm(value => !value)}
              onSchedule={input => scheduleLiveClass.mutate(input)}
              scheduling={scheduleLiveClass.isPending}
              scheduleError={scheduleLiveClass.error?.message}
              onStart={joinOrStart}
              startError={startLiveClass.error?.message}
              startingClassId={startLiveClass.isPending ? startLiveClass.variables?.id : undefined}
            />
          )}
          {view === "recordings" && (
            <section className="library-section" id="recordings">
              <div className="library-heading"><div><span className="eyebrow">YOUR ON-DEMAND STUDIO</span><h2>Recordings</h2><p>Watch a class again, download it, or share it on WhatsApp.</p></div>
                {isTeacher && <button className="button button-ink" type="button" onClick={() => setShowRecordingForm(value => !value)}><Plus size={17} /> Add a recording</button>}
              </div>
              {successNote && <p className="success-note"><Check size={16} /> {successNote}</p>}
              {showRecordingForm && isTeacher && <RecordingForm onSave={saveRecording} pending={addRecording.isPending} onCancel={() => setShowRecordingForm(false)} />}

              {recordingsQuery.isLoading ? <div className="library-loading">Gathering your classes…</div> : recordingsQuery.isError ? (
                <div className="empty-library"><span className="empty-spark"><BookOpen size={21} /></span><h3>Your class library is getting ready.</h3><p>Please refresh in a moment. If the issue continues, ask Priyanka for help.</p><button className="text-link" type="button" onClick={() => void recordingsQuery.refetch()}>Try again <ArrowRight size={15} /></button></div>
              ) : recordingsQuery.data?.length ? (
                <div className="recording-grid">{recordingsQuery.data.map(lesson => <button className="recording-card" type="button" key={lesson.id} onClick={() => setActiveLesson(lesson as Lesson)}>
                  <span className="recording-cover"><img src={HERO_ART} alt="" /><span className="recording-play"><Play size={19} fill="currentColor" /></span><span className="recording-type"><Video size={13} /> REPLAY</span></span>
                  <span className="recording-info"><span className="recording-category">{lesson.category}</span><strong>{lesson.title}</strong><span className="recording-description">{lesson.description || "A replay from Priyanka’s art studio."}</span><span className="recording-meta"><Clock3 size={14} /> {new Date(lesson.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} <ChevronRight size={14} /></span></span>
                </button>)}</div>
              ) : (
                <div className="empty-library"><span className="empty-spark"><BookOpen size={21} /></span><h3>{isTeacher ? "Your first recording goes here." : "Your recordings are on their way."}</h3><p>{isTeacher ? "Upload a class video to catbox.moe, then add its link and it appears in your students’ library." : "Priyanka will add class recordings here."}</p></div>
              )}
              <div className="library-help"><span className="help-petal">✳</span><p><strong>Take it at your pace.</strong> Replay a lesson whenever you want a fresh look at a technique.</p><button type="button" className="text-link" onClick={() => changeView("chat")}>Ask Priyanka a question <ArrowRight size={15} /></button></div>
            </section>
          )}
          {view === "demo" && <section className="student-demo-section"><div className="section-heading"><div><span className="eyebrow">A GUIDED SAMPLE</span><h2>Try a little <em>art together.</em></h2></div><p>A short, self-guided botanical watercolour lesson.</p></div><DemoLesson step={demoStep} setStep={setDemoStep} /><DemoVideoLibrary isTeacher={isTeacher} /></section>}
          {view === "chat" && <ChatPanel
            messages={(messagesQuery.data || []) as Message[]}
            loading={messagesQuery.isLoading}
            error={messagesQuery.isError ? "The chat isn’t available at the moment. Please try again." : sendMessage.error?.message}
            userOpenId={user?.openId ?? ""}
            draft={draft}
            onDraftChange={setDraft}
            onSend={submitMessage}
            sending={sendMessage.isPending}
          />}
        </main>
      )}
      {activeLesson && <RecordingPlayer lesson={activeLesson} close={() => setActiveLesson(null)} />}
    </div>
  );
}
