import type { User } from "firebase/auth";
import { get, ref } from "firebase/database";
import { db } from "@/firebase";

let cached: Promise<string> | null = null;

// The teacher's email lives in the database at config/teacherEmail (set once in the Firebase console).
function teacherEmail() {
  cached ??= get(ref(db, "config/teacherEmail"))
    .then(snap => String(snap.val() ?? "").trim().toLowerCase())
    .catch(() => { cached = null; return ""; });
  return cached;
}

// Only a VERIFIED email counts, so nobody can claim Priyanka's address by signing up with it.
export async function isTeacherUser(user: User | null | undefined) {
  if (!user?.email || !user.emailVerified) return false;
  const email = await teacherEmail();
  return Boolean(email) && email === user.email.trim().toLowerCase();
}
