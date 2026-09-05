import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function getUserRole(user) {
  if (!user) return null;
  const profile = await getDoc(doc(db, "profiles", user.uid));
  const role = profile.exists() ? profile.data().role : null;
  return role === "admin" || role === "viewer" ? role : null;
}