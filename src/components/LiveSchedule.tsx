import { useState, type FormEvent } from "react";
import { ArrowRight, BellRing, CalendarDays, Link2, MessageCircle, X } from "lucide-react";
import { appUrl } from "@/const";
import "@/pages/live-schedule.css";

export type ScheduledClass = {
  id: number;
  title: string;
  notes: string | null;
  startAt: Date;
  durationMinutes: number;
  status: "scheduled" | "live" | "ended";
  hostOpenId: string;
};
export type ScheduleInput = { title: string; notes: string; startAt: Date; durationMinutes: number };

type Props = {
  classes: ScheduledClass[];
  loading: boolean;
  error?: boolean;
  isTeacher: boolean;
  userOpenId: string;
  showForm: boolean;
  onToggleForm: () => void;
  onSchedule: (input: ScheduleInput) => void;
  scheduling: boolean;
  scheduleError?: string;
  onStart: (classId: number) => void;
  startingClassId?: number;
  startError?: string;
};

function localDateTimeDefault() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function escapeCalendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function addCalendarReminder(item: ScheduledClass) {
  const start = new Date(item.startAt);
  const end = new Date(start.getTime() + item.durationMinutes * 60_000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const content = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kalakaari Corner//Class Reminder//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:kalakari-class-${item.id}@kalakari.corner`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeCalendarText(item.title)}`, `DESCRIPTION:${escapeCalendarText(item.notes || `${item.durationMinutes} minute class with Priyanka`)}`,
    "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${escapeCalendarText(`Your Kalakaari class “${item.title}” starts in 15 minutes.`)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `kalakari-class-${item.id}.ics`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ScheduleForm({ onSave, onCancel, pending, error }: {
  onSave: (input: ScheduleInput) => void;
  onCancel: () => void;
  pending: boolean;
  error?: string;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startAt, setStartAt] = useState(localDateTimeDefault);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [localError, setLocalError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const date = new Date(startAt);
    if (!title.trim()) { setLocalError("Add a title for the class."); return; }
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) { setLocalError("Choose a time in the future."); return; }
    setLocalError("");
    onSave({ title: title.trim(), notes: notes.trim(), startAt: date, durationMinutes });
  }
  return (
    <form className="live-schedule-form" onSubmit={submit}>
      <div className="schedule-form-head"><div><span className="eyebrow">A LITTLE TIME TOGETHER</span><h3>Schedule a class</h3></div><button className="icon-button" type="button" onClick={onCancel} aria-label="Close schedule form"><X size={17} /></button></div>
      <label>Class title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Botanical watercolour" maxLength={160} required /></label>
      <div className="schedule-form-row"><label>Date & time<input type="datetime-local" value={startAt} onChange={event => setStartAt(event.target.value)} required /></label><label>Length (minutes)<input type="number" value={durationMinutes} onChange={event => setDurationMinutes(Number(event.target.value))} min={15} max={240} step={15} required /></label></div>
      <label>What we’ll make <span className="schedule-optional">(optional)</span><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add a short class note…" maxLength={1000} rows={2} /></label>
      {(localError || error) && <p className="inline-error" role="alert">{localError || error}</p>}
      <button className="button button-ink" type="submit" disabled={pending}>{pending ? "Saving class…" : "Add to the schedule"} <ArrowRight size={15} /></button>
    </form>
  );
}

export default function LiveSchedule({
  classes, loading, error, isTeacher, userOpenId, showForm, onToggleForm,
  onSchedule, scheduling, scheduleError, onStart, startingClassId, startError,
}: Props) {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  function classLink(item: ScheduledClass) { return appUrl(`/class/${item.id}`); }
  async function copyLink(item: ScheduledClass) {
    try { await navigator.clipboard.writeText(classLink(item)); }
    catch { window.prompt("Copy this class link:", classLink(item)); }
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(null), 2500);
  }
  function shareWhatsApp(item: ScheduledClass) {
    const when = new Date(item.startAt).toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const text = `Join "${item.title}" with Priyanka on Kalakaari Corner!\n${when}\n${classLink(item)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }
  const nextClass = classes.find(item => item.status === "scheduled");
  return (
    <section className="live-schedule-section" id="upcoming-classes" aria-label="Scheduled live classes">
      <div className="live-schedule-heading"><div><span className="eyebrow">MAKE IT TOGETHER</span><h2>Upcoming classes</h2><p>Meet for a little art, together.</p></div>{isTeacher && <button className="button button-ink" type="button" onClick={onToggleForm}><CalendarDays size={16} /> Schedule a class</button>}</div>
      {startError && <p className="inline-error" role="alert">{startError}</p>}
      {showForm && isTeacher && <ScheduleForm onSave={onSchedule} onCancel={onToggleForm} pending={scheduling} error={scheduleError} />}
      {error ? <div className="schedule-empty" role="alert"><CalendarDays size={20} /><p>Class schedule is unavailable. Please try again.</p></div> : loading ? <div className="schedule-empty"><CalendarDays size={20} /><p>Checking the calendar…</p></div> : classes.length === 0 ? (
        <div className="schedule-empty"><span className="schedule-empty-mark"><CalendarDays size={19} /></span><p>{isTeacher ? "Your next live class can start here." : "Upcoming classes will appear here."}</p>{isTeacher && <button className="text-link" type="button" onClick={onToggleForm}>Schedule your first class <ArrowRight size={14} /></button>}</div>
      ) : (
        <>
        {nextClass && <div className="schedule-reminder-banner"><span className="schedule-reminder-icon"><BellRing size={17} /></span><span><strong>Your next class is coming up</strong><small>{new Date(nextClass.startAt).toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span><button type="button" onClick={() => addCalendarReminder(nextClass)}>Add 15-minute reminder</button></div>}
        <div className="live-schedule-list">{classes.map(item => {
          const isOwner = userOpenId === item.hostOpenId;
          const isLive = item.status === "live";
          const classDate = new Date(item.startAt);
          return <article className={`live-schedule-card${isLive ? " is-live" : ""}`} key={item.id}>
            <span className="schedule-date-tile"><strong>{classDate.toLocaleDateString([], { day: "2-digit" })}</strong><small>{classDate.toLocaleDateString([], { month: "short" })}</small></span>
            <div className="schedule-card-copy"><div className="schedule-card-kicker">{isLive ? <span className="schedule-now"><i /> LIVE NOW</span> : classDate.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div><h3>{item.title}</h3><p>{item.notes || `${item.durationMinutes} minute art class`}</p></div>
            <div className="schedule-share" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="schedule-reminder-link" type="button" onClick={() => void copyLink(item)}><Link2 size={14} /> {copiedId === item.id ? "Link copied!" : "Copy class link"}</button>
              <button className="schedule-reminder-link" type="button" onClick={() => shareWhatsApp(item)}><MessageCircle size={14} /> Share on WhatsApp</button>
            </div>
            {!isLive && <button className="schedule-reminder-link" type="button" onClick={() => addCalendarReminder(item)} aria-label={`Add a 15-minute reminder for ${item.title}`}><BellRing size={14} /> Remind me</button>}
            {isLive || isOwner ? <button className={`schedule-join-button${isLive ? " is-live" : ""}`} type="button" onClick={() => onStart(item.id)} disabled={startingClassId === item.id}>{startingClassId === item.id ? "Opening…" : isLive ? "Join class" : "Start class"}<ArrowRight size={15} /></button> : <span className="schedule-waiting-label">Join when Priyanka starts</span>}
          </article>;
        })}</div>
        </>
      )}
    </section>
  );
}
