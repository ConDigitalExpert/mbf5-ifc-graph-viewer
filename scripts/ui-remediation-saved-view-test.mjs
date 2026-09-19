import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = fs.readFileSync(path.join(repoRoot, "dist", "index.html"), "utf8");
const viewerJs = fs.readFileSync(path.join(repoRoot, "dist", "viewer.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "dist", "styles.css"), "utf8");
let passed = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS: ${message}`);
}

check(indexHtml.includes("styles.css?v=20260919-saved-views1") && indexHtml.includes("viewer.js?v=20260919-saved-views1"), "saved-view cache key is wired in the main route");
check(indexHtml.includes('id="saved-view-dialog"') && indexHtml.includes('role="dialog"') && indexHtml.includes('aria-modal="true"'), "saved-view dialog has an accessible modal contract");
check(indexHtml.includes('aria-labelledby="saved-view-dialog-title"') && indexHtml.includes('aria-describedby="saved-view-dialog-description"'), "saved-view dialog names and describes itself");
check(indexHtml.includes('id="saved-view-form"') && indexHtml.includes('id="saved-view-name"') && indexHtml.includes('maxlength="64"'), "saved-view form has a bounded named field");
check(indexHtml.includes('data-action="cancel-save-view"') && indexHtml.includes('type="submit">Save view</button>'), "saved-view dialog exposes explicit Cancel and Save actions");
check(indexHtml.includes('id="saved-view-name-error"') && indexHtml.includes('role="alert"'), "saved-view validation has an announced error region");
check(!viewerJs.includes("window.prompt") && !/\bprompt\s*\(/.test(viewerJs), "saved-view flow contains no native prompt call");
check(viewerJs.includes("openSavedViewDialog") && viewerJs.includes("closeSavedViewDialog") && viewerJs.includes("commitSavedView"), "saved-view flow has explicit open, cancel, and commit functions");
check(viewerJs.includes("normalizeSavedViewName") && viewerJs.includes("savedViewNameKey"), "saved-view names are normalized before validation");
check(viewerJs.includes("That view name is already saved") && viewerJs.includes("Enter a name for this view"), "empty and duplicate names receive clear validation");
check(viewerJs.includes("persistSavedViews") && viewerJs.includes("localStorage.setItem(SAVED_VIEWS_KEY"), "camera state remains persisted through localStorage");
check(viewerJs.includes("els.savedViewSelect.value = String(state.savedViews.length - 1)") && viewerJs.includes("Saved view · ${name}"), "successful save selects the new view and announces confirmation");
check(viewerJs.includes('event.key === "Escape"') && viewerJs.includes('event.key === "Tab"') && viewerJs.includes("savedViewFocusableElements"), "dialog supports Escape and trapped keyboard focus");
check(stylesCss.includes(".saved-view-dialog[hidden]") && stylesCss.includes(".saved-view-name-input") && stylesCss.includes(".dialog-button.primary"), "saved-view dialog has visible, responsive UI styling");

console.log(`Saved-view static/DOM contract test passed ${passed} checks.`);
