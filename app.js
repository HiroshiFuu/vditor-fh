/* global Vditor */

const storage = {
  keyContent: "myvditor:content",
  keyMode: "myvditor:mode", // 'sv' | 'ir'
  keyRatio: "myvditor:svRatio",
  keyPreviewHidden: "myvditor:previewHidden",
};

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("show"), 1100);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function setActiveModeButtons(mode) {
  const svBtn = document.getElementById("btn-mode-sv");
  const irBtn = document.getElementById("btn-mode-ir");
  svBtn.classList.toggle("active", mode === "sv");
  irBtn.classList.toggle("active", mode === "ir");
}

function setupSvSplitter(vditorRootEl, opts = {}) {
  const ratioKey = opts.ratioKey || storage.keyRatio;
  const minRatio = opts.minRatio ?? 0.22;
  const maxRatio = opts.maxRatio ?? 0.78;

  const editor = vditorRootEl.querySelector("pre.vditor-sv");
  const preview = vditorRootEl.querySelector(".vditor-preview");

  if (!editor || !preview) return;

  // Find common parent of editor+preview
  let parent = editor.parentElement;
  while (parent && !parent.contains(preview)) parent = parent.parentElement;
  if (!parent) return;

  if (parent.querySelector(":scope > .sv-splitter")) return;

  // Restore ratio
  const saved = parseFloat(localStorage.getItem(ratioKey) || "");
  if (!Number.isNaN(saved)) {
    const r = clamp(saved, minRatio, maxRatio);
    document.documentElement.style.setProperty(
      "--sv-editor-width",
      r * 100 + "%"
    );
  }

  const splitter = document.createElement("div");
  splitter.className = "sv-splitter";
  splitter.setAttribute("role", "separator");
  splitter.setAttribute("aria-orientation", "vertical");
  splitter.tabIndex = 0;

  parent.insertBefore(splitter, preview);

  const setRatio = (ratio) => {
    const r = clamp(ratio, minRatio, maxRatio);
    document.documentElement.style.setProperty(
      "--sv-editor-width",
      r * 100 + "%"
    );
    localStorage.setItem(ratioKey, String(r));
  };

  let dragging = false;

  const onPointerMove = (ev) => {
    if (!dragging) return;
    const rect = parent.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    setRatio(x / rect.width);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    document.documentElement.classList.remove("split-dragging");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  };

  splitter.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    dragging = true;
    splitter.setPointerCapture(ev.pointerId);
    document.documentElement.classList.add("split-dragging");
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", endDrag, { passive: true });
    window.addEventListener("pointercancel", endDrag, { passive: true });
  });

  // Keyboard resizing
  splitter.addEventListener("keydown", (ev) => {
    const current = parseFloat(localStorage.getItem(ratioKey) || "0.52");
    if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      setRatio(current - 0.02);
    } else if (ev.key === "ArrowRight") {
      ev.preventDefault();
      setRatio(current + 0.02);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      setRatio(0.52);
    }
  });

  splitter.addEventListener("dblclick", () => setRatio(0.52));
}

function applyPreviewHidden(vditorRootEl, hidden) {
  const preview = vditorRootEl.querySelector(".vditor-preview");
  const splitter = vditorRootEl.querySelector(".sv-splitter");
  const editor = vditorRootEl.querySelector("pre.vditor-sv");

  if (!preview || !editor) return;

  if (hidden) {
    preview.style.display = "none";
    if (splitter) splitter.style.display = "none";
    editor.style.flex = "1 1 auto";
    editor.style.flexBasis = "auto";
  } else {
    preview.style.display = "";
    if (splitter) splitter.style.display = "";
    editor.style.flex = "";
    editor.style.flexBasis = "";
  }

  localStorage.setItem(storage.keyPreviewHidden, hidden ? "1" : "0");
}

function setModeAndReload(mode) {
  localStorage.setItem(storage.keyMode, mode);
  location.reload();
}
function setupSvScrollSync(vditorRootEl) {
  const editor = vditorRootEl.querySelector("pre.vditor-sv");
  const viewer = vditorRootEl.querySelector(".vditor-preview");
  if (!editor || !viewer) return;

  let isSyncingFromEditor = false;
  let isSyncingFromViewer = false;
  let rafId = 0;

  const getRatio = (el) => {
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return 0;
    return el.scrollTop / max;
  };

  const setByRatio = (el, ratio) => {
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = max > 0 ? ratio * max : 0;
  };

  const syncFromEditor = () => {
    if (isSyncingFromViewer) return;
    isSyncingFromEditor = true;

    const ratio = getRatio(editor);
    setByRatio(viewer, ratio);

    window.setTimeout(() => {
      isSyncingFromEditor = false;
    }, 0);
  };

  const syncFromViewer = () => {
    if (isSyncingFromEditor) return;
    isSyncingFromViewer = true;

    const ratio = getRatio(viewer);
    setByRatio(editor, ratio);

    window.setTimeout(() => {
      isSyncingFromViewer = false;
    }, 0);
  };

  const onEditorScroll = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(syncFromEditor);
  };

  const onViewerScroll = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(syncFromViewer);
  };

  editor.addEventListener("scroll", onEditorScroll, { passive: true });
  viewer.addEventListener("scroll", onViewerScroll, { passive: true });

  // 返回一个清理函数（如果你以后要切换模式/重建）
  return () => {
    editor.removeEventListener("scroll", onEditorScroll);
    viewer.removeEventListener("scroll", onViewerScroll);
  };
}

/* -----------------------------
 * Init
 * ----------------------------- */
const initialValue =
  localStorage.getItem(storage.keyContent) ||
  "# Notes\n\n- SV 分屏 + splitter\n- 可切换 IR 模式\n\n```js\nconsole.log('hello')\n```\n";

const initialMode = localStorage.getItem(storage.keyMode) || "sv";
setActiveModeButtons(initialMode);

const vditor = new Vditor("vditor", {
  mode: initialMode, // 'sv' | 'ir'
  height: "100%",
  cache: { enable: false },
  value: initialValue,
  placeholder: "Start writing...",
  toolbar: [
    "headings",
    "bold",
    "italic",
    "strike",
    "|",
    "list",
    "ordered-list",
    "check",
    "|",
    "quote",
    "code",
    "inline-code",
    "|",
    "link",
    "upload",
    "table",
    "|",
    "preview",
    "fullscreen",
    "help",
  ],
  input(md) {
    localStorage.setItem(storage.keyContent, md);
  },
  after() {
    const root = document.getElementById("vditor");

    // Only SV has preview split + splitter
    if (initialMode === "sv") {
      setupSvSplitter(root, {
        ratioKey: storage.keyRatio,
        minRatio: 0.24,
        maxRatio: 0.76,
      });

      const hidden = localStorage.getItem(storage.keyPreviewHidden) === "1";
      applyPreviewHidden(root, hidden);

      setupSvScrollSync(root);
    }
  },
});

/* -----------------------------
 * Buttons
 * ----------------------------- */
document
  .getElementById("btn-mode-sv")
  .addEventListener("click", () => setModeAndReload("sv"));
document
  .getElementById("btn-mode-ir")
  .addEventListener("click", () => setModeAndReload("ir"));

document.getElementById("btn-toggle-preview").addEventListener("click", () => {
  const mode = localStorage.getItem(storage.keyMode) || "sv";
  if (mode !== "sv") {
    toast("Preview toggle is SV only");
    return;
  }
  const root = document.getElementById("vditor");
  const hidden = localStorage.getItem(storage.keyPreviewHidden) === "1";
  applyPreviewHidden(root, !hidden);
  toast(!hidden ? "Preview hidden" : "Preview shown");
});

document.getElementById("btn-copy").addEventListener("click", async () => {
  const md = vditor.getValue();
  await navigator.clipboard.writeText(md);
  toast("Copied");
});

document.getElementById("btn-download").addEventListener("click", () => {
  downloadText("note.md", vditor.getValue());
  toast("Downloaded");
});

/* -----------------------------
 * Keyboard shortcuts (global)
 * - Ctrl+S: download
 * - Ctrl+Shift+C: copy
 * - Ctrl+P: toggle preview (SV only) and prevent print
 * ----------------------------- */
window.addEventListener("keydown", async (ev) => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const ctrl = isMac ? ev.metaKey : ev.ctrlKey;
  if (!ctrl) return;

  if (ev.key.toLowerCase() === "s") {
    ev.preventDefault();
    downloadText("note.md", vditor.getValue());
    toast("Downloaded");
    return;
  }

  if (ev.key.toLowerCase() === "p") {
    ev.preventDefault();
    const mode = localStorage.getItem(storage.keyMode) || "sv";
    if (mode !== "sv") {
      toast("Preview toggle is SV only");
      return;
    }
    const root = document.getElementById("vditor");
    const hidden = localStorage.getItem(storage.keyPreviewHidden) === "1";
    applyPreviewHidden(root, !hidden);
    toast(!hidden ? "Preview hidden" : "Preview shown");
    return;
  }

  if (ev.shiftKey && ev.key.toLowerCase() === "c") {
    ev.preventDefault();
    const md = vditor.getValue();
    await navigator.clipboard.writeText(md);
    toast("Copied");
  }
});
