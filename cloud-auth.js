/* Mimo Studio authentication — Firebase public web configuration; never embed private keys. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup,
  GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const API_ORIGIN = "https://mimo-backend-git-993130348924.europe-west1.run.app";
const firebaseConfig = {
  apiKey: "AIzaSyDZSdw39N55bBRDuDqYbQD7XKTyO1ArAkU",
  authDomain: "mimo-3fb0f.firebaseapp.com",
  projectId: "mimo-3fb0f",
  appId: "1:140768440889:web:e6ef8d7c7b41183c5d13e8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const gate = document.getElementById("cloudGate");
const state = document.getElementById("cloudAuthMessage");
const pill = document.getElementById("cloudStatus");
const account = document.getElementById("cloudAccountBtn");
const login = document.getElementById("cloudLoginForm");
const loginButton = document.getElementById("cloudLoginButton");
const googleButton = document.getElementById("cloudGoogleButton");
const switchAccount = document.getElementById("cloudSwitchAccount");

function announce(message, danger = false) {
  state.textContent = message;
  state.style.color = danger ? "#a43131" : "#606060";
}
function status(text, active = false) {
  pill.textContent = text;
  pill.classList.toggle("cloud-on", active);
}
async function request(path, options = {}) {
  if (!auth.currentUser) throw Error("Sign in to Mimo first.");
  const token = await auth.currentUser.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", "Bearer " + token);
  const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !multipart) headers.set("Content-Type", "application/json");
  // Never set multipart Content-Type manually: the browser supplies its boundary.
  let response;
  try {
    response = await fetch(API_ORIGIN + path, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : multipart ? options.body : JSON.stringify(options.body)
    });
  } catch {
    throw Error("Cannot connect to the Mimo API. Check Cloud Run and MIMO_CORS_ORIGINS.");
  }
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const detail = data?.detail || data?.message || response.statusText;
    throw Error("HTTP " + response.status + ": " + (typeof detail === "string" ? detail : JSON.stringify(detail)));
  }
  return data;
}
async function uploadArtifact(file) {
  if (!(file instanceof File)) throw Error("Select an image file first.");
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    throw Error("Cloud vision currently supports PNG and JPEG images only. PDFs need a separate page-ingestion step.");
  }
  if (!file.size || file.size > 10 * 1024 * 1024) {
    throw Error("The image must be between 1 byte and 10 MiB.");
  }
  const form = new FormData();
  form.append("file", file, file.name);
  return request("/v1/artifacts", {method: "POST", body: form});
}
async function requestBlob(path, options = {}) {
  if (!auth.currentUser) throw Error("Sign in to Mimo first.");
  if (!path.startsWith("/v1/")) throw Error("Invalid authenticated download path.");
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", "Bearer " + await auth.currentUser.getIdToken());
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(API_ORIGIN + path, {
      method: options.method || "GET", headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache:"no-store"
    });
  }catch{throw Error("Cannot connect to Mimo API.");}
  if (!response.ok) {
    let detail = await response.text();
    try { detail = JSON.parse(detail).detail || detail; }catch{}
    throw Error("HTTP " + response.status + ": " + String(detail).slice(0,1800));
  }
  return response.blob();
}
const cloud = { apiOrigin: API_ORIGIN, authorized: false, user: null, request, requestBlob, uploadArtifact };
window.MimoCloud = cloud;

login.addEventListener("submit", async event => {
  event.preventDefault();
  loginButton.disabled = true;
  announce("Signing in…");
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth,
      document.getElementById("cloudEmail").value.trim(),
      document.getElementById("cloudPassword").value);
  } catch (error) {
    announce("Sign-in failed: " + (error.code || error.message), true);
  } finally { loginButton.disabled = false; }
});
googleButton.addEventListener("click", async () => {
  googleButton.disabled = true;
  announce("Opening Google sign-in…");
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch(error) {
    announce("Google sign-in failed: " + (error.code || error.message) +
      ". Make sure Google sign-in is enabled in Firebase Authentication.", true);
  } finally { googleButton.disabled = false; }
});
async function leave() {
  cloud.authorized = false;
  cloud.user = null;
  gate.hidden = false;
  account.hidden = true;
  status("Sign in required");
  await signOut(auth);
  window.dispatchEvent(new Event("mimo:auth-changed"));
}
account.addEventListener("click", leave);
switchAccount.addEventListener("click", leave);

onAuthStateChanged(auth, async user => {
  cloud.authorized = false;
  cloud.user = null;
  account.hidden = true;
  // Do not show the sign-in dialog during Firebase's session restoration.
  // A new document is loaded on each page navigation and the persisted
  // Firebase user is verified asynchronously against the backend.
  status("Checking account…");
  window.dispatchEvent(new Event("mimo:auth-changed"));
  if (!user) {
    gate.hidden = false;
    switchAccount.hidden = true;
    announce("Sign in with the Firebase account whose UID you added to MIMO_ADMIN_UIDS.");
    status("Sign in required");
    return;
  }
  announce("Verifying administrator permissions…");
  try {
    const principal = await request("/v1/me");
    if (principal.role !== "admin") throw Error("Administrator role is required.");
    cloud.authorized = true;
    cloud.user = {uid:user.uid, email:user.email, role:principal.role};
    gate.hidden = true;
    account.hidden = false;
    account.textContent = "Sign out · " + (user.email || "Admin");
    status("Cloud connected", true);
    window.dispatchEvent(new Event("mimo:auth-changed"));
  } catch(error) {
    gate.hidden = false;
    status("Access not granted");
    announce("Signed in to Firebase, but backend access failed: " + error.message +
      ". Verify MIMO_ADMIN_UIDS and the frontend origin in MIMO_CORS_ORIGINS.", true);
    switchAccount.hidden = false;
  }
}, error => {
  gate.hidden = false;
  account.hidden = true;
  status("Authentication error");
  announce(error.message, true);
});
