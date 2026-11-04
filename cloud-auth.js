/* Mimo Studio authentication — Firebase public web configuration; never embed private keys. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup,
  GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// Code-reviewed targets ONLY. Never read Firebase token destinations from the URL,
 // localStorage, window globals, user text fields, or a remote config response.
 // This unreleased production-integration branch pins the live Studio API
 // HTTPS origin verified in Cloud Shell on 2026-11-04. Do not merge or deploy
 // until frontend release and Firebase/CORS checks are separately approved.
const ACTIVE_API_ENVIRONMENT = "production";
const PREVIOUS_PRODUCTION_STUDIO_ORIGIN =
  "https://mimo-backend-git-993130348924.europe-west1.run.app";
const APPROVED_PRODUCTION_STUDIO_ORIGIN = "https://mimo-backend-git-hhe6zssqxa-ew.a.run.app";
const APPROVED_STAGING_STUDIO_ORIGIN = "";
const APPROVED_STUDIO_ORIGINS = Object.freeze({
  production: APPROVED_PRODUCTION_STUDIO_ORIGIN,
  staging: APPROVED_STAGING_STUDIO_ORIGIN
});
function approvedApiOrigin(environment) {
  if (!Object.prototype.hasOwnProperty.call(APPROVED_STUDIO_ORIGINS, environment))
    throw Error("Unknown Mimo API environment.");
  const candidate = APPROVED_STUDIO_ORIGINS[environment];
  if (!candidate) return null; // Fail closed, before requesting any Firebase ID token.
  // Only exact, bare Cloud Run HTTPS origins configured in reviewed source are accepted.
  const url = new URL(candidate);
  const bare = url.origin === candidate && url.protocol === "https:" &&
    url.pathname === "/" && !url.username && !url.password &&
    !url.search && !url.hash && !url.port;
  const cloudRunHost = /^[a-z0-9][a-z0-9.-]*\.run\.app$/.test(url.hostname);
  if (!bare || !cloudRunHost) throw Error("Unapproved Mimo Studio API origin.");
  if (environment === "staging" && [PREVIOUS_PRODUCTION_STUDIO_ORIGIN, APPROVED_PRODUCTION_STUDIO_ORIGIN].includes(candidate))
    throw Error("Staging must use a different, independently verified service.");
  return candidate;
}
const API_ORIGIN = approvedApiOrigin(ACTIVE_API_ENVIRONMENT);
function configuredApiOrigin() {
  if (!API_ORIGIN)
    throw Error("Mimo Studio API origin is not configured. No API request was sent.");
  return API_ORIGIN;
}
function approvedApiPath(path, origin) {
  // Origin + attacker-controlled "@host" or "//host" can change the URL's
  // authority. Reject unsafe paths before fetching the Firebase ID token.
  if (typeof path !== "string" || !path.startsWith("/") ||
      path.startsWith("//") || path.includes("\\") ||
      /%(?:2f|5c)/i.test(path) || /[\x00-\x1f\x7f]/.test(path))
    throw Error("Invalid authenticated Mimo API path.");
  const resolved = new URL(path, origin);
  if (resolved.origin !== origin ||
      !(resolved.pathname.startsWith("/v1/") || resolved.pathname.startsWith("/health/")))
    throw Error("Invalid authenticated Mimo API path.");
  return path;
}
let verificationEpoch = 0;
let signOutPending = false;
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
  const origin = configuredApiOrigin();
  path = approvedApiPath(path, origin);
  const user = auth.currentUser;
  if (!user || signOutPending) throw Error("Sign in to Mimo first.");
  const token = await user.getIdToken();
  if (auth.currentUser !== user || signOutPending)
    throw Error("Account changed before the request could be sent.");
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", "Bearer " + token);
  const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !multipart) headers.set("Content-Type", "application/json");
  // Never set multipart Content-Type manually: the browser supplies its boundary.
  let response;
  try {
    response = await fetch(origin + path, {
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
async function uploadFile(file) {
  if (!(file instanceof File)) throw Error("Select a file to upload.");
  if (!["application/pdf","image/png","image/jpeg"].includes(file.type)) {
    throw Error("Select PDF, PNG or JPEG only.");
  }
  if (file.size < 1 || file.size > 50*1024*1024) {
    throw Error("File size must be 1 byte–50 MiB; the backend may impose a smaller limit.");
  }
  const form = new FormData();
  form.append("file", file, file.name);
  return request("/v1/artifacts",{method:"POST",body:form});
}

async function uploadArtifact(file) {
  if (!(file instanceof File)) throw Error("Select a PDF or image file first.");
  if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
    throw Error("Workflow input supports application/pdf, image/png and image/jpeg files only.");
  }
  if (!file.size || file.size > 10 * 1024 * 1024) {
    throw Error("PDF or image workflow input must be between 1 byte and 10 MiB.");
  }
  const form = new FormData();
  form.append("file", file, file.name);
  return request("/v1/artifacts", {method: "POST", body: form});
}
async function requestBlob(path, options = {}) {
  const origin = configuredApiOrigin();
  path = approvedApiPath(path, origin);
  const user = auth.currentUser;
  if (!user || signOutPending) throw Error("Sign in to Mimo first.");
  if (!path.startsWith("/v1/")) throw Error("Invalid authenticated download path.");
  const token = await user.getIdToken();
  if (auth.currentUser !== user || signOutPending)
    throw Error("Account changed before the download could be sent.");
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", "Bearer " + token);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(origin + path, {
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
const cloud = { authorized: false, user: null, request, requestBlob, uploadArtifact, uploadFile };
// UI code may read this target, but changing window state cannot redirect auth.
Object.defineProperty(cloud, "apiOrigin", {value: API_ORIGIN, enumerable: true});
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
  // Invalidate in-flight /v1/me callbacks immediately, before signOut awaits.
  ++verificationEpoch;
  signOutPending = true;
  cloud.authorized = false;
  cloud.user = null;
  gate.hidden = false;
  account.hidden = true;
  status("Signing out…");
  window.dispatchEvent(new Event("mimo:auth-changed"));
  try {
    await signOut(auth);
  } catch (error) {
    // Keep UI locked even when Firebase sign-out could not be confirmed.
    gate.hidden = false;
    status("Sign-out could not be confirmed");
    announce("Sign out failed: " + error.message, true);
  }
}
account.addEventListener("click", leave);
switchAccount.addEventListener("click", leave);

onAuthStateChanged(auth, async user => {
  const epoch = ++verificationEpoch;
  cloud.authorized = false;
  cloud.user = null;
  account.hidden = true;
  // Firebase restores its session asynchronously. Do not flash the dialog
  // while checking a new user's backend admin role.
  if (user && !signOutPending) gate.hidden = true;
  status("Checking account…");
  window.dispatchEvent(new Event("mimo:auth-changed"));
  if (!user) {
    signOutPending = false;
    gate.hidden = false;
    switchAccount.hidden = true;
    announce("Sign in with the Firebase account whose UID you added to MIMO_ADMIN_UIDS.");
    status("Sign in required");
    return;
  }
  if (signOutPending) return;
  const stillCurrent = () =>
    verificationEpoch === epoch && !signOutPending && auth.currentUser === user;
  announce("Verifying administrator permissions…");
  try {
    const principal = await request("/v1/me");
    if (!stillCurrent()) return;
    if (principal.role !== "admin") throw Error("Administrator role is required.");
    cloud.authorized = true;
    cloud.user = {uid:user.uid, email:user.email, role:principal.role};
    gate.hidden = true;
    account.hidden = false;
    account.textContent = "Sign out · " + (user.email || "Admin");
    status("Cloud connected", true);
    window.dispatchEvent(new Event("mimo:auth-changed"));
  } catch(error) {
    if (!stillCurrent()) return;
    gate.hidden = false;
    status("Access not granted");
    announce("Signed in to Firebase, but backend access failed: " + error.message +
      ". Verify MIMO_ADMIN_UIDS and the frontend origin in MIMO_CORS_ORIGINS.", true);
    switchAccount.hidden = false;
  }
}, error => {
  ++verificationEpoch;
  cloud.authorized = false;
  cloud.user = null;
  gate.hidden = false;
  account.hidden = true;
  status("Authentication error");
  announce(error.message, true);
  window.dispatchEvent(new Event("mimo:auth-changed"));
});
