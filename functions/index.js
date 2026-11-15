"use strict";
// Cloud Functions: the ONLY place the Daily API key is used. The browser never sees it.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const DAILY_API_KEY = defineSecret("DAILY_API_KEY");
const DAILY_API = "https://api.daily.co/v1";
const opts = { secrets: [DAILY_API_KEY], region: "us-central1", timeoutSeconds: 60 };

/* ---------- Daily ---------- */
class DailyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function daily(path, init = {}) {
  const key = DAILY_API_KEY.value().trim();
  if (!key) throw new HttpsError("failed-precondition", "Live video is not configured yet. The Daily API key is missing.");
  const response = await fetch(`${DAILY_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    let message = "Daily could not complete the video-room request.";
    if (response.status === 401 || response.status === 403) message = "Daily rejected the API key. Please check the saved Daily API key.";
    if (response.status === 429) message = "Daily is receiving too many requests. Please wait a moment and try again.";
    if (response.status >= 500) message = "Daily's video service is temporarily unavailable. Please try again shortly.";
    throw new DailyError(response.status, message);
  }
  return payload;
}

async function createRoom(classId, expSeconds) {
  const name = `kalakari-class-${classId}`;
  try {
    const existing = await daily(`/rooms/${encodeURIComponent(name)}`);
    if (existing.name && existing.url) return { name: existing.name, url: existing.url };
  } catch (error) {
    if (!(error instanceof DailyError) || error.status !== 404) throw error;
  }
  const room = await daily("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name,
      privacy: "private",
      properties: {
        exp: expSeconds,
        enable_hidden_participants: true,
        enable_mesh_sfu: true,
        enable_adaptive_simulcast: true,
        experimental_optimize_large_calls: true,
        enable_screenshare: true,
        enable_chat: false,
        enable_prejoin_ui: false,
        start_audio_off: true,
        start_video_off: true,
        permissions: { canSend: false, canAdmin: false },
      },
    }),
  });
  if (!room.name || !room.url) throw new HttpsError("internal", "Daily created a room without returning its join link.");
  return { name: room.name, url: room.url };
}

async function createToken({ roomName, userId, userName, role, expiresAt }) {
  const host = role === "host";
  const speaker = role === "speaker";
  const response = await daily("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_id: userId,
        user_name: userName.slice(0, 120),
        exp: expiresAt,
        is_owner: host,
        enable_prejoin_ui: false,
        enable_screenshare: host,
        ...(host ? { enable_recording: "cloud", start_cloud_recording: true } : {}),
        start_audio_off: !host,
        start_video_off: !host,
        permissions: host
          ? { hasPresence: true, canSend: true, canAdmin: ["participants"] }
          : speaker
            ? { hasPresence: true, canSend: ["audio", "video"], canAdmin: false }
            : { hasPresence: false, canSend: false, canAdmin: false },
      },
    }),
  });
  if (!response.token) throw new HttpsError("internal", "Daily did not return a meeting token.");
  return response.token;
}

/* ---------- helpers ---------- */
const rtdb = () => admin.database();

function classIdFrom(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpsError("invalid-argument", "Invalid class.");
  return id;
}

async function requireTeacher(request) {
  const token = request.auth && request.auth.token;
  if (!token) throw new HttpsError("unauthenticated", "Please sign in.");
  const teacherEmail = String((await rtdb().ref("config/teacherEmail").get()).val() || "").trim().toLowerCase();
  if (!teacherEmail || token.email_verified !== true || String(token.email || "").toLowerCase() !== teacherEmail) {
    throw new HttpsError("permission-denied", "Only Priyanka's verified teacher account can manage these classes.");
  }
  return request.auth.uid;
}

async function loadClass(id) {
  const ref = rtdb().ref(`liveClasses/${id}`);
  const value = (await ref.get()).val();
  return { ref, value };
}

function wrap(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof DailyError) return new HttpsError("unavailable", error.message);
  console.error(error);
  return new HttpsError("internal", "Something went wrong. Please try again.");
}

/* ---------- callable functions ---------- */
exports.startLiveClass = onCall(opts, async request => {
  try {
    const uid = await requireTeacher(request);
    const id = classIdFrom(request.data && request.data.id);
    const { ref, value } = await loadClass(id);
    if (!value || value.hostUid !== uid) throw new HttpsError("permission-denied", "Only the class host can start this session.");
    if (value.status === "ended") throw new HttpsError("failed-precondition", "This class has already ended.");
    if (value.dailyRoomName && value.dailyRoomUrl) {
      if (value.status !== "live") await ref.update({ status: "live" });
      return { success: true };
    }
    const room = await createRoom(id, Math.floor((Math.max(Date.now(), Number(value.startAt) || 0) + (Number(value.durationMinutes) + 360) * 60000) / 1000));
    await ref.update({ status: "live", dailyRoomName: room.name, dailyRoomUrl: room.url });
    return { success: true };
  } catch (error) { throw wrap(error); }
});

exports.endLiveClass = onCall(opts, async request => {
  try {
    const uid = await requireTeacher(request);
    const id = classIdFrom(request.data && request.data.id);
    const { ref, value } = await loadClass(id);
    if (!value || value.hostUid !== uid) throw new HttpsError("permission-denied", "Only the class host can end this session.");
    if (value.status !== "ended") await ref.update({ status: "ended" });
    if (value.dailyRoomName) {
      // Let the room expire shortly instead of deleting it, so Daily can finish saving the recording.
      await daily(`/rooms/${encodeURIComponent(value.dailyRoomName)}`, {
        method: "POST",
        body: JSON.stringify({ properties: { exp: Math.floor(Date.now() / 1000) + 120 } }),
      }).catch(() => console.warn(`Could not expire Daily room for class ${id}`));
    }
    return { success: true };
  } catch (error) { throw wrap(error); }
});

exports.dailyJoinInfo = onCall(opts, async request => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in.");
    const uid = request.auth.uid;
    const id = classIdFrom(request.data && request.data.classId);
    const { value } = await loadClass(id);
    if (!value || value.status !== "live") throw new HttpsError("failed-precondition", "This class is not live yet.");
    if (!value.dailyRoomName || !value.dailyRoomUrl) throw new HttpsError("failed-precondition", "The host needs to open the Daily video room before students can join.");
    let role = "viewer";
    if (value.hostUid === uid) role = "host";
    else {
      const speak = (await rtdb().ref(`speakRequests/${id}/${uid}`).get()).val();
      if (speak && speak.status === "approved") role = "speaker";
    }
    const t = request.auth.token;
    const userName = (t.name && String(t.name).trim()) || (role === "host" ? "Priyanka" : (t.email ? String(t.email).split("@")[0] : "Student"));
    const token = await createToken({
      roomName: value.dailyRoomName,
      userId: `kc-${uid}`,
      userName,
      role,
      expiresAt: Math.floor((Date.now() + (Number(value.durationMinutes) + 90) * 60000) / 1000),
    });
    return { url: value.dailyRoomUrl, token, role };
  } catch (error) { throw wrap(error); }
});

/* ---------- recordings ---------- */
// Finds finished Daily recordings for our class rooms and saves them in the database.
exports.syncRecordings = onCall(opts, async request => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in.");
    const meta = rtdb().ref("meta/recordingSync");
    const last = Number((await meta.get()).val()) || 0;
    if (Date.now() - last < 45000) return { success: true, skipped: true };
    await meta.set(Date.now());
    const listing = await daily("/recordings?limit=100");
    const updates = {};
    for (const rec of listing.data || []) {
      const match = /^kalakari-class-(\d+)$/.exec(String(rec.room_name || ""));
      if (!match || rec.status !== "finished" || !/^[A-Za-z0-9-]{8,64}$/.test(String(rec.id))) continue;
      if (Number(rec.duration) < 10) continue;
      const classId = Number(match[1]);
      const cls = (await rtdb().ref(`liveClasses/${classId}`).get()).val();
      updates[`classRecordings/${rec.id}`] = {
        classId,
        title: (cls && cls.title) || "Live class",
        startedAt: (Number(rec.start_ts) || 0) * 1000,
        duration: Number(rec.duration) || 0,
      };
    }
    if (Object.keys(updates).length) await rtdb().ref().update(updates);
    return { success: true, found: Object.keys(updates).length };
  } catch (error) { throw wrap(error); }
});

// Makes a temporary download link for one saved recording.
exports.recordingDownloadLink = onCall(opts, async request => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in.");
    const id = String((request.data && request.data.recordingId) || "");
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new HttpsError("invalid-argument", "Invalid recording.");
    if (!(await rtdb().ref(`classRecordings/${id}`).get()).exists()) throw new HttpsError("not-found", "That recording isn't available yet.");
    const wanted = Math.min(86400, Math.max(300, Number(request.data && request.data.validForSecs) || 3600));
    let link;
    try {
      link = await daily(`/recordings/${encodeURIComponent(id)}/access-link?valid_for_secs=${wanted}`);
    } catch (error) {
      if (!(error instanceof DailyError) || error.status !== 400 || wanted === 3600) throw error;
      link = await daily(`/recordings/${encodeURIComponent(id)}/access-link?valid_for_secs=3600`);
    }
    const url = link.download_link || link.url;
    if (!url) throw new HttpsError("internal", "Daily did not return a download link.");
    return { url };
  } catch (error) { throw wrap(error); }
});
