import { useEffect, useRef, useState, type FormEvent } from "react";
import DailyIframe, { type DailyCall, type DailyParticipant, type DailyParticipantCounts } from "@daily-co/daily-js";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, CircleHelp, LoaderCircle, LogOut, MessageCircle, Mic, MicOff,
  MonitorUp, Pause, Play, Radio, RefreshCw, Send, Sparkles, Square, Users,
  Video, VideoOff, Wifi, WifiOff, Hand, Check, X,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import ArtfulCorner from "@/components/ArtfulCorner";
import "./classroom.css";

type Props = { params: { id: string } };
type RoomStatus = "loading" | "connecting" | "connected" | "disconnected" | "error";
type SpeakerRequest = { id: number; name: string; status: "pending" | "approved"; createdAt: Date; dailyUserId: string };
type ChatMessage = { id: number; senderOpenId: string; senderName: string; body: string; createdAt: Date };
type TrackLike = { track?: MediaStreamTrack; persistentTrack?: MediaStreamTrack } | undefined;
type ParticipantView = {
  sessionId: string;
  dailyUserId: string;
  name: string;
  isLocal: boolean;
  isHost: boolean;
  videoStream: MediaStream | null;
  screenStream: MediaStream | null;
  audioStream: MediaStream | null;
  audioTracks: MediaStreamTrack[];
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "A";
}

function mediaStream(trackStates: TrackLike[]) {
  const tracks = trackStates.map(state => state?.persistentTrack ?? state?.track).filter((track): track is MediaStreamTrack => Boolean(track && track.readyState !== "ended"));
  return tracks.length ? new MediaStream(tracks) : null;
}

function participantView(participant: DailyParticipant): ParticipantView {
  const audioTracks = [participant.tracks.audio, participant.tracks.screenAudio]
    .map(state => state?.persistentTrack ?? state?.track)
    .filter((track): track is MediaStreamTrack => Boolean(track && track.readyState !== "ended"));
  return {
    sessionId: participant.session_id,
    dailyUserId: participant.user_id,
    name: participant.user_name || "Class participant",
    isLocal: participant.local,
    isHost: participant.owner,
    videoStream: mediaStream([participant.tracks.video]),
    screenStream: mediaStream([participant.tracks.screenVideo]),
    audioStream: audioTracks.length ? new MediaStream(audioTracks) : null,
    audioTracks,
  };
}

function VideoFeed({
  stream, muted, label, className, elementKey, onRegister,
}: {
  stream: MediaStream | null;
  muted: boolean;
  label: string;
  className: string;
  elementKey: string;
  onRegister: (key: string, element: HTMLVideoElement | null) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }, [stream]);
  return <video ref={element => { ref.current = element; onRegister(elementKey, element); }} className={className} autoPlay playsInline muted={muted} aria-label={label} data-name={label} />;
}

function AudioFeed({ stream, label }: { stream: MediaStream | null; label: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.srcObject = stream;
    if (stream) void audio.play().catch(() => undefined);
  }, [stream]);
  return <audio ref={ref} autoPlay aria-label={label} />;
}

function toClock(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function Classroom({ params }: Props) {
  const classId = Number(params.id);
  const validId = Number.isSafeInteger(classId) && classId > 0;
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const classQuery = trpc.classroom.liveClass.useQuery({ id: validId ? classId : 1 }, {
    enabled: isAuthenticated && validId,
    refetchInterval: query => query.state.data?.status === "scheduled" || query.state.data?.status === "live" ? 5_000 : false,
  });
  const chatQuery = trpc.classroom.liveClassMessages.useQuery({ classId: validId ? classId : 1 }, {
    enabled: isAuthenticated && validId && classQuery.data?.status === "live",
    refetchInterval: 5_000,
  });
  const dailyJoinInfo = trpc.classroom.dailyJoinInfo.useMutation();
  const requestToSpeak = trpc.classroom.requestToSpeak.useMutation({
    onSuccess: async () => { await utils.classroom.myLiveClassSpeakRequest.invalidate({ classId }); },
  });
  const leaveSpeaker = trpc.classroom.leaveLiveClassSpeaker.useMutation({
    onSuccess: async () => { await utils.classroom.myLiveClassSpeakRequest.invalidate({ classId }); },
  });
  const ownSpeakRequest = trpc.classroom.myLiveClassSpeakRequest.useQuery({ classId: validId ? classId : 1 }, {
    enabled: isAuthenticated && validId && Boolean(classQuery.data && classQuery.data.status === "live" && user?.openId !== classQuery.data.hostOpenId),
    refetchInterval: 4_000,
  });
  const speakerRequests = trpc.classroom.liveClassSpeakerRequests.useQuery({ classId: validId ? classId : 1 }, {
    enabled: isAuthenticated && validId && Boolean(classQuery.data && classQuery.data.status === "live" && user?.openId === classQuery.data.hostOpenId),
    refetchInterval: 4_000,
  });
  const changeSpeakerRequest = trpc.classroom.updateLiveClassSpeakerRequest.useMutation({
    onSuccess: async (result, variables) => {
      await utils.classroom.liveClassSpeakerRequests.invalidate({ classId });
      if (variables.action === "revoke" && "dailyUserId" in result) {
        const target = Object.values(callRef.current?.participants() ?? {}).find(person => person.user_id === result.dailyUserId);
        if (target && callRef.current) {
          callRef.current.updateParticipant(target.session_id, { updatePermissions: { canSend: false, hasPresence: false } });
        }
      }
    },
  });
  const startMutation = trpc.classroom.startLiveClass.useMutation({ onSuccess: async () => { await classQuery.refetch(); } });
  const endMutation = trpc.classroom.endLiveClass.useMutation({
    onSuccess: async () => { stopRecording(); await classQuery.refetch(); },
  });
  const sendMessage = trpc.classroom.sendLiveClassMessage.useMutation({
    onSuccess: async () => { setDraft(""); await utils.classroom.liveClassMessages.invalidate({ classId }); },
  });

  const liveClass = classQuery.data;
  const isHost = Boolean(user && liveClass && user.openId === liveClass.hostOpenId);
  const isLive = liveClass?.status === "live";
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("loading");
  const [roomMessage, setRoomMessage] = useState("");
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const participantsRef = useRef<ParticipantView[]>([]);
  const [participantCounts, setParticipantCounts] = useState<DailyParticipantCounts>({ present: 0, hidden: 0 });
  const [localMicOn, setLocalMicOn] = useState(false);
  const [localCameraOn, setLocalCameraOn] = useState(false);
  const [joinedRole, setJoinedRole] = useState<"host" | "speaker" | "viewer" | null>(null);
  const [draft, setDraft] = useState("");
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [recordState, setRecordState] = useState<"idle" | "recording" | "paused" | "saving">("idle");
  const [recordNote, setRecordNote] = useState("");
  const [joinedAt, setJoinedAt] = useState<Date | null>(null);
  const callRef = useRef<DailyCall | null>(null);
  const videoElementsRef = useRef(new Map<string, HTMLVideoElement>());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixedAudioTracksRef = useRef(new WeakSet<MediaStreamTrack>());
  const frameRef = useRef<number | null>(null);
  const drawCancelledRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const registerVideo = (key: string, element: HTMLVideoElement | null) => {
    if (element) videoElementsRef.current.set(key, element);
    else videoElementsRef.current.delete(key);
  };

  useEffect(() => {
    if (!isAuthenticated || !isLive || !validId || !user || !liveClass?.dailyRoomUrl) {
      if (!authLoading && isLive && liveClass && !liveClass.dailyRoomUrl && user?.openId !== liveClass.hostOpenId) {
        setRoomStatus("connecting");
        setRoomMessage("Priyanka is preparing the secure video room. This page will join as soon as she opens it.");
      }
      return;
    }
    let disposed = false;
    let call: DailyCall | null = null;
    setRoomStatus("connecting");
    setRoomMessage("Connecting to Daily’s secure live classroom…");
    setJoinedRole(null);

    const refreshParticipants = (dailyCall: DailyCall) => {
      const view = Object.values(dailyCall.participants()).map(participantView);
      participantsRef.current = view;
      setParticipants(view);
      setParticipantCounts(dailyCall.participantCounts());
      if (dailyCall === callRef.current) {
        setLocalMicOn(dailyCall.localAudio());
        setLocalCameraOn(dailyCall.localVideo());
      }
    };

    const connect = async () => {
      try {
        const credentials = await dailyJoinInfo.mutateAsync({ classId });
        if (disposed) return;
        call = DailyIframe.createCallObject({ subscribeToTracksAutomatically: true });
        callRef.current = call;
        const current = call;
        const refresh = () => refreshParticipants(current);
        current.on("joined-meeting", () => {
          if (disposed) return;
          setRoomStatus("connected"); setRoomMessage(""); setJoinedAt(new Date());
          refresh();
        });
        current.on("left-meeting", () => {
          if (!disposed) setRoomStatus("disconnected");
        });
        current.on("participant-joined", refresh);
        current.on("participant-updated", refresh);
        current.on("participant-left", refresh);
        current.on("participant-counts-updated", event => {
          if (!disposed) setParticipantCounts(event.participantCounts);
        });
        current.on("track-started", refresh);
        current.on("track-stopped", refresh);
        current.on("local-screen-share-started", refresh);
        current.on("local-screen-share-stopped", refresh);
        current.on("error", event => {
          if (!disposed) setRoomMessage(event?.errorMsg || "The Daily call reported a media error. Check your camera, microphone, or network.");
        });
        await current.join({ url: credentials.url, token: credentials.token });
        if (disposed) {
          await current.leave().catch(() => undefined);
          await current.destroy().catch(() => undefined);
          return;
        }
        setJoinedRole(credentials.role);
        setRoomStatus("connected"); setRoomMessage(""); setJoinedAt(new Date());
        refresh();
      } catch (error) {
        if (disposed) return;
        setRoomStatus("error");
        setRoomMessage(error instanceof Error ? error.message : "Could not join the Daily classroom. Please try again.");
      }
    };

    void connect();
    return () => {
      disposed = true;
      const oldCall = call;
      if (callRef.current === oldCall) callRef.current = null;
      if (oldCall) {
        void oldCall.leave().catch(() => undefined).finally(() => { void oldCall.destroy().catch(() => undefined); });
      }
      participantsRef.current = [];
      setParticipants([]); setParticipantCounts({ present: 0, hidden: 0 });
    };
  }, [isAuthenticated, isLive, validId, classId, connectAttempt, user?.openId, liveClass?.dailyRoomUrl]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatQuery.data?.length]);

  useEffect(() => {
    const context = audioContextRef.current;
    const destination = audioDestinationRef.current;
    if (!context || !destination) return;
    for (const person of participants) {
      for (const track of person.audioTracks) {
        if (track.readyState === "ended" || mixedAudioTracksRef.current.has(track)) continue;
        try {
          context.createMediaStreamSource(new MediaStream([track])).connect(destination);
          mixedAudioTracksRef.current.add(track);
        } catch { /* A track already connected to the recorder is ignored. */ }
      }
    }
  }, [participants]);

  useEffect(() => () => {
    drawCancelledRef.current = true;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* The browser may already be stopping it. */ }
    }
  }, []);

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setRecordState("saving");
      try { recorder.stop(); } catch { setRecordState("idle"); }
    }
  }

  function startRecording() {
    if (!isHost || joinedRole !== "host") return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280; canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context || !canvas.captureStream || typeof MediaRecorder === "undefined") throw new Error("This browser cannot record the class.");
      const videoStream = canvas.captureStream(24);
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      audioContextRef.current = audioContext;
      audioDestinationRef.current = destination;
      mixedAudioTracksRef.current = new WeakSet<MediaStreamTrack>();
      for (const person of participantsRef.current) {
        for (const track of person.audioTracks) {
          if (track.readyState === "ended") continue;
          try {
            audioContext.createMediaStreamSource(new MediaStream([track])).connect(destination);
            mixedAudioTracksRef.current.add(track);
          } catch { /* A track already connected to the recorder is ignored. */ }
        }
      }

      drawCancelledRef.current = false;
      const drawFrame = () => {
        if (drawCancelledRef.current) return;
        context.fillStyle = "#201a21";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const stage = videoElementsRef.current.get("stage");
        if (stage && stage.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && stage.videoWidth) {
          const scale = Math.max(canvas.width / stage.videoWidth, canvas.height / stage.videoHeight);
          const width = stage.videoWidth * scale; const height = stage.videoHeight * scale;
          context.save(); context.beginPath(); context.rect(0, 0, canvas.width, canvas.height); context.clip();
          context.drawImage(stage, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height); context.restore();
        } else {
          context.fillStyle = "#fffaf3"; context.font = "600 36px sans-serif"; context.fillText("Kalakaari Corner · Live class", 48, 74);
          context.fillStyle = "rgba(255,255,255,.76)"; context.font = "22px sans-serif"; context.fillText("Waiting for the host’s camera or screen…", 48, 116);
        }
        const tiles = [...videoElementsRef.current.entries()].filter(([key, element]) => key !== "stage" && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && element.videoWidth).slice(0, 7);
        const tileWidth = 150; const tileHeight = 94; const gap = 12; const margin = 24;
        tiles.forEach(([key, video], index) => {
          const x = margin + index * (tileWidth + gap); const y = canvas.height - tileHeight - margin;
          context.fillStyle = "rgba(37,26,34,.86)"; context.fillRect(x - 2, y - 2, tileWidth + 4, tileHeight + 28);
          const scale = Math.max(tileWidth / video.videoWidth, tileHeight / video.videoHeight);
          const width = video.videoWidth * scale; const height = video.videoHeight * scale;
          context.save(); context.beginPath(); context.rect(x, y, tileWidth, tileHeight); context.clip();
          context.drawImage(video, x + (tileWidth - width) / 2, y + (tileHeight - height) / 2, width, height); context.restore();
          context.fillStyle = "#fffdf9"; context.font = "500 13px sans-serif";
          context.fillText((video.getAttribute("data-name") || key.replace("tile:", "")).slice(0, 20), x + 6, y + tileHeight + 18);
        });
        context.fillStyle = "rgba(37,26,34,.84)"; context.fillRect(canvas.width - 236, canvas.height - 58, 212, 34);
        context.fillStyle = "#fffdf9"; context.font = "600 13px sans-serif";
        context.fillText(`${participantCounts.present + participantCounts.hidden} in class · Kalakaari Corner`, canvas.width - 224, canvas.height - 36);
        frameRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrame();
      const mixed = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(mixed, { mimeType }) : new MediaRecorder(mixed);
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        drawCancelledRef.current = true;
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        if (blob.size > 0) {
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = objectUrl;
          anchor.download = `kalakari-class-${classId}-${new Date().toISOString().slice(0, 10)}.webm`;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
          setRecordNote("Recording downloaded to this device. Share the file separately if students need it.");
        }
        mixed.getTracks().forEach(track => track.stop());
        void audioContext.close();
        audioContextRef.current = null; audioDestinationRef.current = null;
        recorderRef.current = null; setRecordState("idle");
      };
      recorder.onerror = () => { setRecordState("idle"); setRoomMessage("Recording stopped unexpectedly. Check your browser storage and try again."); };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecordNote(""); setRecordState("recording");
    } catch (error) {
      setRoomMessage(error instanceof Error ? error.message : "Recording could not start in this browser.");
    }
  }

  function toggleRecording() {
    const recorder = recorderRef.current;
    if (!recorder) { startRecording(); return; }
    if (recorder.state === "recording") { recorder.pause(); setRecordState("paused"); }
    else if (recorder.state === "paused") { recorder.resume(); setRecordState("recording"); }
  }

  function toggleMic() {
    if (joinedRole !== "host" && joinedRole !== "speaker") return;
    const call = callRef.current;
    if (call) {
      const next = !call.localAudio();
      call.setLocalAudio(next);
      setLocalMicOn(next);
    }
  }

  function toggleCamera() {
    if (joinedRole !== "host" && joinedRole !== "speaker") return;
    const call = callRef.current;
    if (call) {
      const next = !call.localVideo();
      call.setLocalVideo(next);
      setLocalCameraOn(next);
    }
  }

  function toggleScreenShare() {
    if (!isHost || joinedRole !== "host") return;
    const call = callRef.current;
    if (!call) return;
    if (call.localScreenVideo()) call.stopScreenShare();
    else {
      try { call.startScreenShare(); setRoomMessage(""); }
      catch (error) { setRoomMessage(error instanceof Error ? error.message : "Screen sharing could not start in this browser."); }
    }
  }

  async function reconnectAsCurrentRole() {
    setRoomStatus("connecting"); setRoomMessage("Refreshing your secure Daily permissions…");
    const previous = callRef.current;
    callRef.current = null;
    if (previous) {
      await previous.leave().catch(() => undefined);
      await previous.destroy().catch(() => undefined);
    }
    setParticipants([]); participantsRef.current = [];
    setConnectAttempt(value => value + 1);
  }

  async function returnToAudience() {
    try {
      await leaveSpeaker.mutateAsync({ classId });
      await reconnectAsCurrentRole();
    } catch (error) {
      setRoomMessage(error instanceof Error ? error.message : "Could not return to the audience. Please try again.");
    }
  }

  function handleSendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sendMessage.isPending || !isLive) return;
    sendMessage.mutate({ classId, body });
  }

  function updateRequest(requestId: number, action: "approve" | "decline" | "revoke") {
    changeSpeakerRequest.mutate({ classId, requestId, action });
  }

  async function retryConnection() {
    const previous = callRef.current;
    callRef.current = null;
    if (previous) {
      await previous.leave().catch(() => undefined);
      await previous.destroy().catch(() => undefined);
    }
    participantsRef.current = []; setParticipants([]); setRoomMessage(""); setRoomStatus("connecting");
    setConnectAttempt(value => value + 1);
  }

  if (authLoading || (isAuthenticated && classQuery.isLoading)) {
    return <div className="live-load-screen"><LoaderCircle className="spin" size={22} /> Preparing the classroom…</div>;
  }
  if (!isAuthenticated) {
    return <main className="live-gate-screen"><div className="live-gate-card"><span className="live-gate-mark">✳</span><p className="eyebrow">KALAKAARI CORNER · BY PRIYANKA</p><h1>Join the class studio</h1><p>Please sign in to enter this live class.</p><button className="room-button room-button-primary" type="button" onClick={() => startLogin()}>Sign in <ArrowLeft size={16} /></button><Link href="/" className="room-back-link">Back to studio</Link></div></main>;
  }
  if (!validId || classQuery.isError || !liveClass) {
    return <div className="live-load-screen"><p>This class could not be found.</p><Link href="/" className="room-back-link">Return to the studio</Link></div>;
  }

  const localParticipant = participants.find(person => person.isLocal);
  const hostParticipant = participants.find(person => person.isHost);
  const stageStream = hostParticipant?.screenStream ?? hostParticipant?.videoStream ?? null;
  const totalPeople = participantCounts.present + participantCounts.hidden;
  const activeSlotsUsed = participantCounts.present;
  const isScreenSharing = Boolean(hostParticipant?.screenStream);
  const classIsEnded = liveClass.status === "ended";
  const ownRequest = ownSpeakRequest.data;
  const requests = (speakerRequests.data ?? []) as SpeakerRequest[];
  const pendingRequests = requests.filter(request => request.status === "pending");
  const approvedRequests = requests.filter(request => request.status === "approved");
  const messages = (chatQuery.data ?? []) as ChatMessage[];
  const micOn = localMicOn;
  const cameraOn = localCameraOn;

  return (
    <div className="live-class-page">
      <ArtfulCorner className="live-room-decoration" />
      <header className="live-class-header">
        <Link className="live-brand" href="/" aria-label="Kalakaari Corner by Priyanka home"><span className="live-brand-mark">✳</span><span><strong>Kalakaari Corner</strong><small>by Priyanka</small></span></Link>
        <div className="live-header-title"><span className="eyebrow">LIVE CLASSROOM</span><strong>{liveClass.title}</strong></div>
        <Link className="room-back-link" href="/"><ArrowLeft size={16} /> Back to studio</Link>
      </header>

      <main className="live-room-layout">
        <section className="live-room-main" aria-label="Live class">
          <div className="live-room-meta">
            <div><span className={`room-live-dot${isLive && !classIsEnded ? " is-live" : ""}`} />{classIsEnded ? "Class ended" : liveClass.status === "scheduled" ? `Starts ${new Date(liveClass.startAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : roomStatus === "connected" ? "In the classroom" : "Connecting to class"}</div>
            <span className="room-count"><Users size={15} /> {totalPeople} in class</span>
          </div>
          {liveClass.notes && <p className="live-class-notes">{liveClass.notes}</p>}

          {liveClass.status === "scheduled" ? (
            <div className="room-wait-state"><div className="empty-spark"><Radio size={22} /></div><span className="eyebrow">YOUR CLASS IS ON THE CALENDAR</span><h2>We’ll be ready when the class begins.</h2><p>{isHost ? "Start the room when you’re ready for students to join." : "Keep this page handy. Students can join after Priyanka starts the live class."}</p>{isHost && <button className="room-button room-button-primary" type="button" disabled={startMutation.isPending} onClick={() => startMutation.mutate({ id: classId })}>{startMutation.isPending ? "Starting…" : "Start class now"}<Video size={16} /></button>}{startMutation.error && <p className="room-alert">{startMutation.error.message}</p>}</div>
          ) : classIsEnded ? (
            <div className="room-wait-state"><div className="empty-spark"><Sparkles size={22} /></div><span className="eyebrow">THAT’S A WRAP</span><h2>This class has ended.</h2><p>{recordNote || "Return to the studio to see what’s next."}</p><Link className="room-button room-button-primary" href="/">Back to my classes <ArrowLeft size={16} /></Link></div>
          ) : liveClass.dailyRoomUrl ? (
            <>
              <div className="live-audience-note"><Radio size={15} /><span>Daily large-audience mode · account plan sets the attendee limit; confirm quota before a 75+ student class. Priyanka’s camera or shared screen stays pinned, and students can request a speaking turn.</span></div>
              <div className="live-stage-shell">
                <div className="live-stage">
                  {stageStream ? <VideoFeed stream={stageStream} muted label={isScreenSharing ? "Priyanka’s pinned class screen" : "Priyanka, host of the class"} className="live-stage-video" elementKey="stage" onRegister={registerVideo} /> : <div className="stage-placeholder"><span className="stage-avatar">{initials(isHost ? user?.name || "Priyanka" : hostParticipant?.name || "P")}</span><strong>{hostParticipant ? `${hostParticipant.name} is connecting…` : isHost ? "Your camera is getting ready…" : "Waiting for Priyanka to join…"}</strong><small>The host’s camera or shared screen appears here for the class.</small></div>}
                  {isScreenSharing && <div className="pinned-share-badge"><MonitorUp size={14} /> {isHost ? "YOUR SCREEN · PINNED FOR EVERYONE" : "PRIYANKA’S SCREEN · PINNED"}</div>}
                  {roomStatus === "connecting" && <span className="stage-connecting"><LoaderCircle className="spin" size={16} /> Joining the room…</span>}
                  {roomStatus === "disconnected" && <span className="stage-connecting"><WifiOff size={16} /> Reconnecting needed</span>}
                </div>
                <div className="live-participant-rail" aria-label="Host and active speakers">
                  {participants.map(person => <div className={`participant-tile${person.isHost ? " is-host-tile" : ""}${person.isLocal ? " is-local-tile" : ""}`} key={person.sessionId}>
                    {(person.screenStream || person.videoStream) ? <VideoFeed stream={person.screenStream ?? person.videoStream} muted label={person.name} className="participant-video" elementKey={`tile:${person.sessionId}`} onRegister={registerVideo} /> : <span className="participant-avatar">{initials(person.name)}</span>}
                    <span className="participant-name">{person.name}{person.isLocal ? " · you" : person.isHost ? " · host" : ""}</span>
                    {person.isHost && <span className="host-chip">HOST</span>}
                  </div>)}
                  {participants.length === 0 && roomStatus === "connected" && <div className="waiting-chip"><Users size={16} /><span>Waiting for active speakers</span></div>}
                </div>
              </div>

              {participants.filter(person => !person.isLocal && person.audioStream).map(person => <AudioFeed key={person.sessionId} stream={person.audioStream} label={`${person.name} audio`} />)}
              {roomMessage && <p className="room-alert" role="status">{roomMessage}{roomStatus === "error" && <button type="button" className="room-retry" onClick={() => void retryConnection()}><RefreshCw size={14} /> Try again</button>}</p>}
              <div className="live-control-bar">
                <div className="control-group">
                  <button className={`room-control${micOn ? "" : " is-off"}`} type="button" onClick={toggleMic} disabled={!isHost && joinedRole !== "speaker"} aria-label={micOn ? "Mute microphone" : "Unmute microphone"}><span>{micOn ? <Mic size={18} /> : <MicOff size={18} />}</span><small>{micOn ? "Mute" : "Unmute"}</small></button>
                  <button className={`room-control${cameraOn ? "" : " is-off"}`} type="button" onClick={toggleCamera} disabled={!isHost && joinedRole !== "speaker"} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}><span>{cameraOn ? <Video size={18} /> : <VideoOff size={18} />}</span><small>{cameraOn ? "Camera" : "Camera off"}</small></button>
                  {isHost && <button className={`room-control room-share-control${isScreenSharing ? " is-active" : ""}`} type="button" onClick={toggleScreenShare} disabled={roomStatus !== "connected" || classIsEnded} aria-label={isScreenSharing ? "Stop sharing screen" : "Share your screen"}><span><MonitorUp size={18} /></span><small>{isScreenSharing ? "Stop sharing" : "Share screen"}</small></button>}
                  {!isHost && joinedRole === "viewer" && <span className="viewer-device-hint"><Hand size={15} /> Ask Priyanka to speak to use your mic and camera</span>}
                </div>
                <div className="record-controls">
                  {isHost ? <>
                    {recordState === "idle" ? <button className="record-start" type="button" onClick={startRecording} disabled={roomStatus !== "connected" || classIsEnded || joinedRole !== "host"}><span className="record-dot" /> Record class</button> : <>
                      <span className={`recording-pill${recordState === "paused" ? " is-paused" : ""}`}><span className="record-dot" />{recordState === "saving" ? "Saving…" : recordState === "paused" ? "Recording paused" : "Recording"}</span>
                      {recordState !== "saving" && <button className="record-pause" type="button" onClick={toggleRecording}>{recordState === "paused" ? <Play size={15} /> : <Pause size={15} />}{recordState === "paused" ? "Resume" : "Pause"}</button>}
                      {recordState !== "saving" && <button className="record-stop" type="button" onClick={stopRecording}><Square size={13} fill="currentColor" /> Stop & download</button>}
                    </>}
                  </> : <span className="record-host-only"><CircleHelp size={15} /> Recording is host-only</span>}
                </div>
              </div>
              <div className="record-footnote">{isHost ? "Your class recording is mixed and downloaded to this device; it isn’t uploaded automatically." : "You’re watching in the audience. Priyanka’s camera or shared screen is pinned on the main stage."}</div>
              {recordNote && recordState === "idle" && <p className="record-download-note">{recordNote}</p>}

              {!isHost && <section className={`speaker-request-card${joinedRole === "speaker" ? " is-speaker" : ""}`} aria-label="Request permission to speak">
                <div className="speaker-request-copy"><span className="eyebrow">JOIN THE CONVERSATION</span><strong>{joinedRole === "speaker" ? "You’re on the speaker stage" : "Would you like to speak?"}</strong><p>{joinedRole === "speaker" ? "Your camera and microphone are available. They start off until you turn them on." : "You’re watching with the class. Ask Priyanka for a speaker place before turning on your microphone or camera."}</p></div>
                {joinedRole === "speaker" ? <button className="speaker-request-button is-approved" type="button" disabled={leaveSpeaker.isPending} onClick={() => void returnToAudience()}>{leaveSpeaker.isPending ? "Returning…" : "Return to audience"}<Users size={15} /></button> : ownRequest?.status === "pending" ? <span className="speaker-status-pill"><LoaderCircle className="spin" size={14} /> Waiting for Priyanka</span> : ownRequest?.status === "approved" ? <button className="speaker-request-button is-approved" type="button" disabled={roomStatus !== "connected"} onClick={() => void reconnectAsCurrentRole()}>Join as speaker <Video size={15} /></button> : <button className="speaker-request-button" type="button" disabled={requestToSpeak.isPending} onClick={() => requestToSpeak.mutate({ classId })}>{requestToSpeak.isPending ? "Sending…" : ownRequest?.status === "declined" ? "Ask again" : ownRequest?.status === "revoked" ? "Request to speak" : "Request to speak"}<Hand size={15} /></button>}
                {ownRequest?.status === "declined" && <span className="speaker-decision-note">Priyanka declined this request. You can ask again later.</span>}
                {requestToSpeak.error && <span className="speaker-decision-note is-error">{requestToSpeak.error.message}</span>}
              </section>}

              {isHost && <section className="speaker-queue-card" aria-label="Student speaker requests">
                <div className="speaker-queue-heading"><div><span className="eyebrow">HOST CONTROLS</span><h3>Requests to speak</h3><p>Up to 24 student speakers may join you; the rest can keep watching and chatting.</p></div><span className="speaker-queue-count"><Users size={14} /> {activeSlotsUsed}/25 active</span></div>
                {speakerRequests.isError ? <p className="speaker-queue-empty">The speak-request list could not be loaded.</p> : pendingRequests.length === 0 && approvedRequests.length === 0 ? <p className="speaker-queue-empty">No student requests yet. They can raise a hand from the audience.</p> : <div className="speaker-request-list">
                  {pendingRequests.map(request => <article className="speaker-request-row" key={request.id}><span className="speaker-avatar">{initials(request.name)}</span><span className="speaker-person-copy"><strong>{request.name}</strong><small>Would like to speak</small></span><button type="button" className="speaker-approve" disabled={changeSpeakerRequest.isPending || approvedRequests.length >= 24} onClick={() => updateRequest(request.id, "approve")} aria-label={`Approve ${request.name}`}><Check size={15} /> Approve</button><button type="button" className="speaker-decline" disabled={changeSpeakerRequest.isPending} onClick={() => updateRequest(request.id, "decline")} aria-label={`Decline ${request.name}`}><X size={15} /></button></article>)}
                  {approvedRequests.map(request => <article className="speaker-request-row is-approved" key={request.id}><span className="speaker-avatar">{initials(request.name)}</span><span className="speaker-person-copy"><strong>{request.name}</strong><small>Approved · speaker place reserved</small></span><button type="button" className="speaker-revoke" disabled={changeSpeakerRequest.isPending} onClick={() => updateRequest(request.id, "revoke")}>Return to audience</button></article>)}
                </div>}
                {changeSpeakerRequest.error && <p className="speaker-decision-note is-error">{changeSpeakerRequest.error.message}</p>}
              </section>}
              {isHost && <button className="end-class-button" type="button" disabled={endMutation.isPending || classIsEnded} onClick={() => endMutation.mutate({ id: classId })}>{endMutation.isPending ? "Ending…" : "End class for everyone"}<LogOut size={15} /></button>}
            </>
          ) : (
            <div className="room-wait-state"><div className="empty-spark"><Radio size={22} /></div><span className="eyebrow">DAILY VIDEO ROOM</span><h2>{isHost ? "Open the class room." : "The host is preparing the class room."}</h2><p>{isHost ? "Start the Daily-backed room when you’re ready; students will be able to join as viewers." : "Keep this page open. The class will connect as soon as Priyanka starts the video room."}</p>{isHost && <button className="room-button room-button-primary" type="button" disabled={startMutation.isPending} onClick={() => startMutation.mutate({ id: classId })}>{startMutation.isPending ? "Opening room…" : "Open video room"}<Video size={16} /></button>}{startMutation.error && <p className="room-alert">{startMutation.error.message}</p>}{roomMessage && <p className="room-alert">{roomMessage}</p>}</div>
          )}
          <div className="room-network-note"><Wifi size={14} /> Daily carries the large class broadcast; students stay in receive-only mode until Priyanka approves a speaker request.</div>
        </section>

        {isLive && !classIsEnded && <aside className="live-chat-panel" aria-label="Live class chat">
          <div className="live-chat-header"><span className="live-chat-icon"><MessageCircle size={18} /></span><div><span className="eyebrow">IN THIS CLASS</span><h2>Class chat</h2></div><span className="chat-live-tag"><span /> LIVE</span></div>
          <div className="live-chat-messages" aria-live="polite">
            {chatQuery.isLoading ? <p className="live-chat-empty">Opening the conversation…</p> : messages.length === 0 ? <div className="live-chat-empty"><MessageCircle size={23} /><strong>Say hello to the class.</strong><span>Messages here stay with this session.</span></div> : messages.map(message => {
              const own = message.senderOpenId === user?.openId;
              return <article className={`live-chat-message${own ? " own" : ""}`} key={message.id}><div className="live-message-avatar">{initials(message.senderName)}</div><div className="live-message-content"><div><strong>{own ? "You" : message.senderName}</strong><time>{toClock(message.createdAt)}</time></div><p>{message.body}</p></div></article>;
            })}
            {chatQuery.isError && <p className="room-alert">Chat history could not be loaded.</p>}
            <div ref={chatEndRef} />
          </div>
          <form className="live-chat-composer" onSubmit={handleSendMessage}><label className="sr-only" htmlFor="live-chat-input">Write a class chat message</label><textarea id="live-chat-input" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Message the class…" rows={1} maxLength={1000} /><button type="submit" disabled={!draft.trim() || sendMessage.isPending} aria-label="Send class message"><Send size={17} /></button></form>
          {sendMessage.error && <p className="live-chat-error" role="alert">{sendMessage.error.message}</p>}
          <p className="live-chat-footnote">A kind word goes a long way.</p>
        </aside>}
      </main>
      <footer className="live-class-footer"><span>Kalakaari Corner · by Priyanka</span><span>{joinedAt ? `Connected ${toClock(joinedAt)}` : "A little corner to learn together"}</span></footer>
    </div>
  );
}
