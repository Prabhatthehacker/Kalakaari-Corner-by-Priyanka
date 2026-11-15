// Firebase-backed replacement for the old tRPC client. The pages still call
// trpc.classroom.something.useQuery() / useMutation(), but the data now comes
// straight from Firebase Realtime Database (and Cloud Functions for Daily video).
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  get, limitToLast, onValue, orderByChild, push, query, ref, serverTimestamp, set, update,
} from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "@/firebase";
import { isTeacherUser } from "@/lib/teacher";

/* ---------- helpers ---------- */
const authReady = new Promise<void>(resolve => {
  const stop = onAuthStateChanged(auth, () => { resolve(); stop(); });
});

async function me(): Promise<User> {
  await authReady;
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in to continue.");
  return user;
}
async function teacher(): Promise<User> {
  const user = await me();
  if (!(await isTeacherUser(user))) throw new Error("Only Priyanka's verified teacher account can do this.");
  return user;
}
const nameOf = (user: User) => (user.displayName?.trim() || user.email?.split("@")[0] || "Student").slice(0, 160);
const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
const D = (value: unknown) => new Date(Number(value) || 0);
const call = async (name: string, data: unknown) => (await httpsCallable(functions, name)(data)).data as any;

function rows(snap: any): any[] {
  const out: any[] = [];
  snap.forEach((child: any) => { out.push({ ...child.val(), key: child.key }); });
  return out;
}
function requireHttps(value: string) {
  let ok = false;
  try { ok = new URL(value).protocol === "https:"; } catch { /* not a link */ }
  if (!ok) throw new Error("A secure HTTPS video link is required.");
}

/* ---------- row mappers (shape the pages expect) ---------- */
const lesson = (r: any) => ({ id: Number(r.key), title: r.title, category: r.category, description: r.description ?? "", videoUrl: r.videoUrl, createdByOpenId: r.createdBy, createdAt: D(r.createdAt) });
const demo = (r: any) => ({ id: Number(r.key), title: r.title, description: r.description ?? "", videoUrl: r.videoUrl, status: r.status, createdByOpenId: r.createdBy, createdAt: D(r.createdAt), updatedAt: D(r.updatedAt) });
const chat = (r: any) => ({ id: r.key, senderOpenId: r.senderUid, senderName: r.senderName, body: r.body, createdAt: D(r.createdAt) });
const liveClass = (r: any) => ({ id: Number(r.key), title: r.title, notes: r.notes ?? "", startAt: D(r.startAt), durationMinutes: r.durationMinutes, status: r.status, hostOpenId: r.hostUid, dailyRoomName: r.dailyRoomName ?? null, dailyRoomUrl: r.dailyRoomUrl ?? null, createdAt: D(r.createdAt) });
const byNewest = (a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime();

/* ---------- endpoints ---------- */
type Endpoint = { kind: "query" | "mutation"; run: (input: any) => Promise<any>; watch?: (input: any) => string | null };
const q = (run: Endpoint["run"], watch?: Endpoint["watch"]): Endpoint => ({ kind: "query", run, watch });
const m = (run: Endpoint["run"]): Endpoint => ({ kind: "mutation", run });

const api: Record<string, Endpoint> = {
  "classroom.recordings": q(async () => {
    await me();
    return rows(await get(ref(db, "recordings"))).map(lesson).sort(byNewest).slice(0, 100);
  }, () => "recordings"),

  "classroom.demoVideos": q(async () => {
    await me();
    return rows(await get(ref(db, "demoVideos"))).map(demo).filter(v => v.status === "published").sort(byNewest).slice(0, 100);
  }, () => "demoVideos"),

  "classroom.teacherDemoVideos": q(async () => {
    await teacher();
    return rows(await get(ref(db, "demoVideos"))).map(demo).sort(byNewest).slice(0, 100);
  }, () => "demoVideos"),

  "classroom.addDemoVideo": m(async (input: { title: string; description: string; videoUrl: string }) => {
    const user = await teacher();
    requireHttps(input.videoUrl);
    const now = Date.now();
    await set(ref(db, `demoVideos/${newId()}`), { title: input.title.trim().slice(0, 140), description: (input.description ?? "").trim().slice(0, 2000), videoUrl: input.videoUrl.trim(), status: "published", createdBy: user.uid, createdAt: now, updatedAt: now });
    return { success: true } as const;
  }),

  "classroom.updateDemoVideo": m(async (input: { id: number; title: string; description: string }) => {
    await teacher();
    await update(ref(db, `demoVideos/${input.id}`), { title: input.title.trim().slice(0, 140), description: input.description.trim().slice(0, 2000), updatedAt: Date.now() });
    return { success: true } as const;
  }),

  "classroom.archiveDemoVideo": m(async (input: { id: number }) => {
    await teacher();
    await update(ref(db, `demoVideos/${input.id}`), { status: "archived", updatedAt: Date.now() });
    return { success: true } as const;
  }),

  "classroom.addRecording": m(async (input: { title: string; category: string; description?: string; videoUrl: string }) => {
    const user = await teacher();
    requireHttps(input.videoUrl);
    await set(ref(db, `recordings/${newId()}`), { title: input.title.trim().slice(0, 140), category: input.category.trim().slice(0, 60), description: (input.description ?? "").trim().slice(0, 2000), videoUrl: input.videoUrl.trim(), createdBy: user.uid, createdAt: Date.now() });
    return { success: true } as const;
  }),

  // Class recordings are saved automatically by Daily; the site picks them up here.
  "classroom.classRecordings": q(async () => {
    await me();
    return rows(await get(ref(db, "classRecordings")))
      .map(r => ({ id: r.key, classId: Number(r.classId), title: r.title || "Live class", startedAt: D(r.startedAt), durationSeconds: Number(r.duration) || 0 }))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 100);
  }, () => "classRecordings"),
  "classroom.syncRecordings": m(async () => { await me(); return call("syncRecordings", {}); }),
  "classroom.recordingDownloadLink": m(async (input: { recordingId: string; validForSecs?: number }) => { await me(); return call("recordingDownloadLink", input); }),

  "classroom.messages": q(async () => {
    await me();
    return rows(await get(query(ref(db, "messages"), orderByChild("createdAt"), limitToLast(100)))).map(chat);
  }, () => "messages"),

  "classroom.sendMessage": m(async (input: { body: string }) => {
    const user = await me();
    await push(ref(db, "messages"), { senderUid: user.uid, senderName: nameOf(user), body: input.body.trim().slice(0, 1000), createdAt: serverTimestamp() });
    return { success: true } as const;
  }),

  "classroom.liveClasses": q(async () => {
    await me();
    return rows(await get(ref(db, "liveClasses"))).map(liveClass)
      .filter(c => c.status === "scheduled" || c.status === "live")
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).slice(0, 100);
  }, () => "liveClasses"),

  "classroom.liveClass": q(async (input: { id: number }) => {
    await me();
    const snap = await get(ref(db, `liveClasses/${input.id}`));
    return snap.exists() ? liveClass({ ...snap.val(), key: snap.key }) : null;
  }, (input: { id: number }) => `liveClasses/${input.id}`),

  "classroom.isTeacher": q(async () => isTeacherUser(await me())),

  "classroom.scheduleLiveClass": m(async (input: { title: string; notes?: string; startAt: Date; durationMinutes: number }) => {
    const user = await teacher();
    if (new Date(input.startAt).getTime() < Date.now() - 60_000) throw new Error("Choose a future date and time.");
    if (!(input.durationMinutes >= 15 && input.durationMinutes <= 240)) throw new Error("Class length must be between 15 and 240 minutes.");
    const id = newId();
    await set(ref(db, `liveClasses/${id}`), { title: input.title.trim().slice(0, 160), notes: (input.notes ?? "").trim().slice(0, 1000), startAt: new Date(input.startAt).getTime(), durationMinutes: Math.round(input.durationMinutes), status: "scheduled", hostUid: user.uid, createdAt: Date.now() });
    return { id };
  }),

  // Daily video: these three run in Cloud Functions so the Daily API key never reaches the browser.
  "classroom.startLiveClass": m(async (input: { id: number }) => { await teacher(); return call("startLiveClass", { id: input.id }); }),
  "classroom.endLiveClass": m(async (input: { id: number }) => { await teacher(); return call("endLiveClass", { id: input.id }); }),
  "classroom.dailyJoinInfo": m(async (input: { classId: number }) => { await me(); return call("dailyJoinInfo", { classId: input.classId }); }),

  "classroom.liveClassMessages": q(async (input: { classId: number }) => {
    await me();
    return rows(await get(query(ref(db, `liveClassMessages/${input.classId}`), orderByChild("createdAt"), limitToLast(100)))).map(chat);
  }, (input: { classId: number }) => `liveClassMessages/${input.classId}`),

  "classroom.sendLiveClassMessage": m(async (input: { classId: number; body: string }) => {
    const user = await me();
    await push(ref(db, `liveClassMessages/${input.classId}`), { senderUid: user.uid, senderName: nameOf(user), body: input.body.trim().slice(0, 1000), createdAt: serverTimestamp() });
    return { success: true } as const;
  }),

  "classroom.myLiveClassSpeakRequest": q(async (input: { classId: number }) => {
    const user = await me();
    const snap = await get(ref(db, `speakRequests/${input.classId}/${user.uid}`));
    return snap.exists() ? { status: snap.val().status, createdAt: D(snap.val().createdAt) } : null;
  }, (input: { classId: number }) => (auth.currentUser ? `speakRequests/${input.classId}/${auth.currentUser.uid}` : null)),

  "classroom.requestToSpeak": m(async (input: { classId: number }) => {
    const user = await me();
    const path = `speakRequests/${input.classId}/${user.uid}`;
    const current = (await get(ref(db, path))).val();
    if (current?.status === "pending" || current?.status === "approved") return { status: current.status } as const;
    const now = Date.now();
    await set(ref(db, path), { id: newId(), studentName: nameOf(user), status: "pending", createdAt: now, updatedAt: now });
    return { status: "pending" } as const;
  }),

  "classroom.leaveLiveClassSpeaker": m(async (input: { classId: number }) => {
    const user = await me();
    await update(ref(db, `speakRequests/${input.classId}/${user.uid}`), { status: "revoked", updatedAt: Date.now() });
    return { success: true } as const;
  }),

  "classroom.liveClassSpeakerRequests": q(async (input: { classId: number }) => {
    await teacher();
    return rows(await get(ref(db, `speakRequests/${input.classId}`)))
      .filter(r => r.status === "pending" || r.status === "approved")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(r => ({ id: r.id, name: r.studentName, status: r.status, createdAt: D(r.createdAt), dailyUserId: `kc-${r.key}` }));
  }, (input: { classId: number }) => `speakRequests/${input.classId}`),

  "classroom.updateLiveClassSpeakerRequest": m(async (input: { classId: number; requestId: number; action: "approve" | "decline" | "revoke" }) => {
    await teacher();
    const all = rows(await get(ref(db, `speakRequests/${input.classId}`)));
    const request = all.find(r => r.id === input.requestId);
    if (!request) throw new Error("Speaker request not found.");
    const path = `speakRequests/${input.classId}/${request.key}`;
    const dailyUserId = `kc-${request.key}`;
    if (input.action === "approve") {
      if (request.status !== "pending") throw new Error("This request is no longer waiting for a decision.");
      if (all.filter(r => r.status === "approved").length >= 24) throw new Error("Daily allows 25 active participants including the host. All 24 student speaker places are in use; return a speaker to the audience before approving another.");
      await update(ref(db, path), { status: "approved", updatedAt: Date.now() });
      return { success: true, dailyUserId } as const;
    }
    if (input.action === "decline") {
      if (request.status !== "pending") throw new Error("Only a pending request can be declined.");
      await update(ref(db, path), { status: "declined", updatedAt: Date.now() });
      return { success: true } as const;
    }
    if (request.status !== "approved") throw new Error("Only an approved speaker can be returned to the audience.");
    await update(ref(db, path), { status: "revoked", updatedAt: Date.now() });
    return { success: true, dailyUserId } as const;
  }),
};

/* ---------- react hooks with the same shape the pages already use ---------- */
function keyFor(name: string, input?: unknown) { return input === undefined ? [name] : [name, input]; }

function makeProc(name: string) {
  const ep = api[name];
  if (!ep) throw new Error(`Unknown endpoint: ${name}`);
  return {
    useQuery(input?: any, options?: any) {
      const client = useQueryClient();
      const key = keyFor(name, input);
      const enabled = options?.enabled ?? true;
      const hash = JSON.stringify(key);
      // Live updates: whenever the watched database path changes, refetch this query.
      useEffect(() => {
        if (!enabled || !ep.watch) return;
        const path = ep.watch(input);
        if (!path) return;
        let first = true;
        return onValue(ref(db, path), () => {
          if (first) { first = false; return; }
          client.invalidateQueries({ queryKey: key });
        }, () => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [enabled, hash]);
      return useQuery({ ...options, queryKey: key, queryFn: () => ep.run(input) }) as any;
    },
    useMutation(options?: any) {
      return useMutation({ ...options, mutationFn: (input: any) => ep.run(input) }) as any;
    },
  };
}

function namespace(ns: string) {
  return new Proxy({}, { get: (_t, proc: string) => makeProc(`${ns}.${proc}`) }) as any;
}

function useUtils() {
  const client = useQueryClient();
  return new Proxy({}, {
    get: (_t, ns: string) => new Proxy({}, {
      get: (_t2, proc: string) => ({
        invalidate: (input?: unknown) => client.invalidateQueries({ queryKey: keyFor(`${ns}.${proc}`, input) }),
        refetch: (input?: unknown) => client.refetchQueries({ queryKey: keyFor(`${ns}.${proc}`, input) }),
      }),
    }),
  }) as any;
}

export const trpc = { useUtils, classroom: namespace("classroom") } as any;
