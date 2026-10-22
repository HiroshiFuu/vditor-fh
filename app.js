/* global Vditor */

const storage = {
  keyContent: "myvditor:content",
  keyMode: "myvditor:mode", // 'sv' | 'ir' | 'viewer'
  keyRatio: "myvditor:svRatio",
  keyPreviewHidden: "myvditor:previewHidden",
};

let vditor = null;

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
  const viewerBtn = document.getElementById("btn-mode-viewer");

  svBtn.classList.toggle("active", mode === "sv");
  irBtn.classList.toggle("active", mode === "ir");
  viewerBtn.classList.toggle("active", mode === "viewer");
}

function setWorkspaceMode(mode) {
  const workspace = document.querySelector(".workspace");
  const editorCard = document.getElementById("editor-card");
  const vditorEl = document.getElementById("vditor");
  const viewerEl = document.getElementById("viewer-content");

  if (!workspace || !editorCard) return;

  const isViewer = mode === "viewer";
  document.body.classList.toggle("viewer-mode", isViewer);
  workspace.classList.toggle("viewer-mode", isViewer);
  editorCard.classList.toggle("viewer-card", isViewer);

  if (vditorEl) {
    vditorEl.style.display = isViewer ? "none" : "";
  }

  if (viewerEl) {
    viewerEl.classList.toggle("hidden", !isViewer);
  }
}

function togglePreviewMode() {
  const mode = localStorage.getItem(storage.keyMode) || "sv";

  if (mode === "viewer") {
    setModeAndReload("ir");
    return;
  }

  if (mode === "ir") {
    setModeAndReload("viewer");
    return;
  }

  const root = document.getElementById("vditor");
  const hidden = localStorage.getItem(storage.keyPreviewHidden) === "1";
  applyPreviewHidden(root, !hidden);
  toast(!hidden ? "Preview hidden" : "Preview shown");
}

function setupSvSplitter(vditorRootEl, opts = {}) {
  const ratioKey = opts.ratioKey || storage.keyRatio;
  const minRatio = opts.minRatio ?? 0.22;
  const maxRatio = opts.maxRatio ?? 0.78;

  const editor = vditorRootEl.querySelector("pre.vditor-sv");
  const preview = vditorRootEl.querySelector(".vditor-preview");

  if (!editor || !preview) return;

  let parent = editor.parentElement;
  while (parent && !parent.contains(preview)) parent = parent.parentElement;
  if (!parent) return;

  if (parent.querySelector(":scope > .sv-splitter")) return;

  const saved = parseFloat(localStorage.getItem(ratioKey) || "");
  if (!Number.isNaN(saved)) {
    const r = clamp(saved, minRatio, maxRatio);
    document.documentElement.style.setProperty("--sv-editor-width", r * 100 + "%");
  }

  const splitter = document.createElement("div");
  splitter.className = "sv-splitter";
  splitter.setAttribute("role", "separator");
  splitter.setAttribute("aria-orientation", "vertical");
  splitter.tabIndex = 0;

  parent.insertBefore(splitter, preview);

  const setRatio = (ratio) => {
    const r = clamp(ratio, minRatio, maxRatio);
    document.documentElement.style.setProperty("--sv-editor-width", r * 100 + "%");
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

function renderViewerNav() {
  const nav = document.getElementById("viewer-nav");
  const viewer = document.getElementById("viewer-content");
  if (!nav || !viewer) return;

  const headings = Array.from(viewer.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  nav.innerHTML = "";

  if (!headings.length) {
    const empty = document.createElement("div");
    empty.className = "viewer-empty";
    empty.textContent = "No sections";
    nav.appendChild(empty);
    return;
  }

  const rootList = document.createElement("ul");
  rootList.className = "viewer-nav-list";
  const stack = [rootList];

  headings.forEach((heading) => {
    const level = Number(heading.tagName.replace("H", ""));
    const parentList = stack[level - 1] || rootList;

    while (stack.length > level) {
      stack.pop();
    }

    const item = document.createElement("li");
    item.className = "viewer-nav-item-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "viewer-nav-item";
    btn.textContent = heading.textContent.trim();
    btn.style.paddingLeft = `${(level - 1) * 10 + 10}px`;
    btn.addEventListener("click", () => {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const childList = document.createElement("ul");
    childList.className = "viewer-nav-sublist";
    item.appendChild(btn);
    item.appendChild(childList);
    parentList.appendChild(item);
    stack[level] = childList;
  });

  nav.appendChild(rootList);
}

function setupViewerMode() {
  const markdown = localStorage.getItem(storage.keyContent) || "# Welcome\n\nStart writing to view your document here.";
  const viewerEl = document.getElementById("viewer-content");
  const editorEl = document.getElementById("vditor");

  if (!viewerEl || !editorEl) return;

  setWorkspaceMode("viewer");
  viewerEl.innerHTML = "";

  Vditor.preview(viewerEl, markdown, {
    mode: "light",
    markdown: {
      toc: true,
    },
    after() {
      renderViewerNav();
    },
  });
}

function getCurrentMarkdown() {
  if (vditor && typeof vditor.getValue === "function") {
    return vditor.getValue();
  }
  return localStorage.getItem(storage.keyContent) || "";
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

  return () => {
    editor.removeEventListener("scroll", onEditorScroll);
    viewer.removeEventListener("scroll", onViewerScroll);
  };
}

const initialValue = localStorage.getItem(storage.keyContent) || "# Welcome\n\nThis is a Vditor note.";
const initialMode = localStorage.getItem(storage.keyMode) || "sv";
setActiveModeButtons(initialMode);
setWorkspaceMode(initialMode);

if (initialMode === "viewer") {
  setupViewerMode();
} else {
  vditor = new Vditor("vditor", {
    mode: initialMode,
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
}

document.getElementById("btn-mode-sv").addEventListener("click", () => setModeAndReload("sv"));
document.getElementById("btn-mode-ir").addEventListener("click", () => setModeAndReload("ir"));
document.getElementById("btn-mode-viewer").addEventListener("click", () => setModeAndReload("viewer"));

document.getElementById("btn-toggle-preview").addEventListener("click", () => {
  const mode = localStorage.getItem(storage.keyMode) || "sv";

  if (mode === "viewer") {
    setModeAndReload("ir");
    return;
  }

  if (mode === "ir") {
    setModeAndReload("viewer");
    return;
  }

  const root = document.getElementById("vditor");
  const hidden = localStorage.getItem(storage.keyPreviewHidden) === "1";
  applyPreviewHidden(root, !hidden);
  toast(!hidden ? "Preview hidden" : "Preview shown");
});

document.getElementById("btn-copy").addEventListener("click", async () => {
  const md = getCurrentMarkdown();
  await navigator.clipboard.writeText(md);
  toast("Copied");
});

document.getElementById("btn-download").addEventListener("click", () => {
  downloadText("note.md", getCurrentMarkdown());
  toast("Downloaded");
});

window.addEventListener("keydown", async (ev) => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const ctrl = isMac ? ev.metaKey : ev.ctrlKey;
  if (!ctrl) return;

  if (ev.key.toLowerCase() === "s") {
    ev.preventDefault();
    downloadText("note.md", getCurrentMarkdown());
    toast("Downloaded");
    return;
  }

  if (ev.key.toLowerCase() === "p") {
    ev.preventDefault();
    const mode = localStorage.getItem(storage.keyMode) || "sv";

    if (mode === "viewer") {
      setModeAndReload("ir");
      return;
    }

    if (mode === "ir") {
      setModeAndReload("viewer");
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
    const md = getCurrentMarkdown();
    await navigator.clipboard.writeText(md);
    toast("Copied");
  }
});
