(function () {
  "use strict";

  /* =================================================================
     Constants & meta
     ================================================================= */
  const STORAGE_KEY = "homeworkHub.tasks.v2";

  const CATEGORY = {
    "urgent-important": { label: "ด่วน + จำเป็น", emoji: "🔴", cls: "ui", order: 0 },
    "urgent-notimportant": { label: "ด่วน + ไม่จำเป็น", emoji: "🟠", cls: "un", order: 1 },
    "noturgent-important": { label: "ไม่ด่วน + จำเป็น", emoji: "🟡", cls: "ni", order: 2 },
    "noturgent-notimportant": { label: "ไม่ด่วน + ไม่จำเป็น", emoji: "⚪", cls: "nn", order: 3 },
  };

  const STATUS = {
    todo: { label: "ยังไม่ได้ทำ", cls: "" },
    doing: { label: "กำลังทำ", cls: "st-doing" },
    done: { label: "ทำเสร็จแล้ว", cls: "st-done" },
    submitted: { label: "ส่งแล้ว", cls: "st-submitted" },
  };

  const STATUS_ORDER = ["todo", "doing", "done", "submitted"];

  const FILTERS = [
    { key: "all", label: "ทั้งหมด" },
    { key: "cat:urgent-important", label: "🔴 ด่วน + จำเป็น" },
    { key: "cat:urgent-notimportant", label: "🟠 ด่วน + ไม่จำเป็น" },
    { key: "cat:noturgent-important", label: "🟡 ไม่ด่วน + จำเป็น" },
    { key: "cat:noturgent-notimportant", label: "⚪ ไม่ด่วน + ไม่จำเป็น" },
    { key: "status:todo", label: "ยังไม่ได้ทำ" },
    { key: "status:doing", label: "กำลังทำ" },
    { key: "status:done", label: "ทำเสร็จแล้ว" },
    { key: "status:submitted", label: "ส่งแล้ว" },
  ];

  /* =================================================================
     State
     ================================================================= */
  let tasks = [];
  let currentView = "dashboard";
  let activeFilter = "all";
  let sortMode = "priority";
  let searchQuery = "";
  let editingId = null;
  let pendingDeleteId = null;

  /* =================================================================
     Date helpers
     ================================================================= */
  function todayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return isoFromDate(d);
  }
  function isoFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return isoFromDate(d);
  }
  function daysUntil(iso) {
    const today = new Date(todayISO() + "T00:00:00");
    const due = new Date(iso + "T00:00:00");
    return Math.round((due - today) / 86400000);
  }
  function formatThaiDate(iso) {
    const d = new Date(iso + "T00:00:00");
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
  }
  function dueMeta(iso) {
    const diff = daysUntil(iso);
    if (diff < 0) return { text: `เลยกำหนด ${Math.abs(diff)} วัน`, cls: "due-over", bucket: "over" };
    if (diff === 0) return { text: "ส่งวันนี้", cls: "due-today", bucket: "today" };
    if (diff === 1) return { text: "เหลือ 1 วัน", cls: "due-soon", bucket: "soon" };
    if (diff <= 3) return { text: `เหลือ ${diff} วัน`, cls: "due-soon", bucket: "soon" };
    return { text: `เหลือ ${diff} วัน`, cls: "due-ok", bucket: "ok" };
  }

  /* =================================================================
     Storage
     ================================================================= */
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        tasks = JSON.parse(raw);
        return;
      }
    } catch (e) {
      console.error("โหลดข้อมูลไม่สำเร็จ", e);
    }
    tasks = seedTasks();
    saveTasks();
  }
  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.error("บันทึกข้อมูลไม่สำเร็จ", e);
      showToast("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่", "danger");
    }
  }

  function seedTasks() {
    const t = todayISO();
    return [
      {
        id: uid(),
        subject: "ตัวอย่าง",
        title: "ลองเพิ่มการบ้านของคุณ",
        type: "ตัวอย่าง",
        dueDate: addDays(t, 1),
        dueTime: "",
        note: "นี่คือการบ้านตัวอย่าง เพื่อให้ดูวิธีกรอกข้อมูลก่อนเริ่มใช้งานจริง",
        category: "urgent-important",
        status: "todo",
        createdAt: Date.now(),
      },
    ];
  }

  function uid() {
    return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /* =================================================================
     DOM refs
     ================================================================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const viewTitle = $("#view-title");
  const viewSubtitle = $("#view-subtitle");
  const topbarSearch = $("#topbar-search");
  const searchInput = $("#search-input");

  const statGrid = $("#stat-grid");
  const dashUrgentList = $("#dash-urgent-list");
  const dashBreakdown = $("#dash-breakdown");

  const filterChipsEl = $("#filter-chips");
  const sortSelect = $("#sort-select");
  const taskListEl = $("#task-list");
  const tasksEmptyEl = $("#tasks-empty");

  const taskForm = $("#task-form");
  const formId = $("#form-id");
  const fSubject = $("#f-subject");
  const fType = $("#f-type");
  const fTitle = $("#f-title");
  const fDate = $("#f-date");
  const fTime = $("#f-time");
  const fNote = $("#f-note");
  const formSubmitBtn = $("#form-submit");
  const formCancelBtn = $("#form-cancel");

  const notifGroups = $("#notif-groups");
  const notifBadge = $("#notif-badge");
  const notifBadgeMobile = $("#notif-badge-mobile");

  const confirmOverlay = $("#confirm-overlay");
  const confirmCancelBtn = $("#confirm-cancel");
  const confirmDeleteBtn = $("#confirm-delete");

  const toastStack = $("#toast-stack");

  const VIEW_META = {
    dashboard: { title: "ภาพรวมการบ้าน", subtitle: "สรุปสถานะงานทั้งหมดของคุณวันนี้", search: false },
    tasks: { title: "การบ้านทั้งหมด", subtitle: "ดู ค้นหา และจัดการงานทุกชิ้นของคุณ", search: true },
    add: { title: "เพิ่มการบ้าน", subtitle: "กรอกรายละเอียดงานใหม่ให้ครบถ้วน", search: false },
    notifications: { title: "แจ้งเตือน", subtitle: "งานที่ใกล้ถึงกำหนดและเลยกำหนดส่ง", search: false },
  };

  /* =================================================================
     View switching
     ================================================================= */
  function switchView(view) {
    // Leaving the "add/edit" view through the sidebar/tab bar (rather than
    // the form's own Cancel/Submit buttons) should also clear any
    // in-progress edit, so the form starts fresh next time it's opened.
    const leavingAddMidEdit = currentView === "add" && view !== "add" && editingId !== null;

    currentView = view;
    $$(".view").forEach((el) => (el.hidden = el.id !== `view-${view}`));
    $$(".nav-item").forEach((el) => el.classList.toggle("is-active", el.dataset.view === view));
    $$(".tab-item").forEach((el) => el.classList.toggle("is-active", el.dataset.view === view));

    const meta = VIEW_META[view];
    viewTitle.textContent = meta.title;
    viewSubtitle.textContent = meta.subtitle;
    topbarSearch.hidden = !meta.search;

    if (leavingAddMidEdit) resetForm();
    if (view === "add" && editingId === null) resetForm();

    renderCurrentView();
    window.scrollTo(0, 0);
  }

  function renderCurrentView() {
    if (currentView === "dashboard") renderDashboard();
    else if (currentView === "tasks") renderTaskList();
    else if (currentView === "notifications") renderNotifications();
    renderNotifBadge();
  }

  /* =================================================================
     Dashboard
     ================================================================= */
  function renderDashboard() {
    const total = tasks.length;
    const dueToday = tasks.filter((t) => t.status !== "submitted" && dueMeta(t.dueDate).bucket === "today").length;
    const dueSoon = tasks.filter((t) => t.status !== "submitted" && dueMeta(t.dueDate).bucket === "soon").length;
    const done = tasks.filter((t) => t.status === "done" || t.status === "submitted").length;
    const overdue = tasks.filter((t) => t.status !== "submitted" && dueMeta(t.dueDate).bucket === "over").length;

    const stats = [
      { label: "การบ้านทั้งหมด", num: total, accent: "" },
      { label: "ต้องส่งวันนี้", num: dueToday, accent: "accent-today" },
      { label: "ใกล้ครบกำหนด", num: dueSoon, accent: "accent-soon" },
      { label: "ทำเสร็จแล้ว", num: done, accent: "accent-done" },
      { label: "เลยกำหนดส่ง", num: overdue, accent: "accent-overdue" },
    ];
    statGrid.innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card ${s.accent}">
        <div class="stat-num">${s.num}</div>
        <div class="stat-label">${s.label}</div>
      </div>`
      )
      .join("");

    // Urgent list preview: not submitted, sorted by priority, top 5
    const urgentTasks = sortByPriority(tasks.filter((t) => t.status !== "submitted")).slice(0, 5);
    dashUrgentList.innerHTML = urgentTasks.length
      ? urgentTasks.map((t) => dashRowHTML(t)).join("")
      : `<p class="notif-empty-line">ยังไม่มีงานในระบบ — ลองเพิ่มการบ้านชิ้นแรกดูสิ</p>`;

    // Breakdown by category
    dashBreakdown.innerHTML = Object.entries(CATEGORY)
      .map(([key, meta]) => {
        const count = tasks.filter((t) => t.category === key).length;
        const pct = total ? Math.round((count / total) * 100) : 0;
        return `
        <div class="legend-row">
          <div class="legend-top"><span>${meta.emoji} ${meta.label}</span><span>${count} งาน</span></div>
          <div class="legend-track"><div class="legend-fill" style="width:${pct}%; background:var(--cat-${meta.cls})"></div></div>
        </div>`;
      })
      .join("");
  }

  function dashRowHTML(t) {
    const dm = dueMeta(t.dueDate);
    const cat = CATEGORY[t.category];
    return `
      <div class="task-card border-${cat.cls}" style="box-shadow:none; padding:12px 14px;">
        <div class="task-main">
          <div class="task-top">
            <span class="task-subject">${escapeHTML(t.subject)}</span>
            <span class="task-type">${escapeHTML(t.type || "")}</span>
          </div>
          <p class="task-title">${escapeHTML(t.title)}</p>
          <div class="task-meta">
            <span class="due-chip ${dm.cls}">${dm.text}</span>
            <span class="cat-badge cat-${cat.cls}-badge"><span class="dot"></span>${cat.label}</span>
          </div>
        </div>
      </div>`;
  }

  function renderNotifBadge() {
    const count = tasks.filter(
      (t) => t.status !== "submitted" && ["today", "soon", "over"].includes(dueMeta(t.dueDate).bucket)
    ).length;
    [notifBadge, notifBadgeMobile].forEach((el) => {
      if (!el) return;
      el.hidden = count === 0;
      el.textContent = String(count);
    });
  }

  /* =================================================================
     Task list (All homework)
     ================================================================= */
  function renderFilterChips() {
    filterChipsEl.innerHTML = FILTERS.map(
      (f) => `<button type="button" class="chip ${f.key === activeFilter ? "is-active" : ""}" data-filter="${f.key}">${f.label}</button>`
    ).join("");
  }

  function sortByPriority(list) {
    return [...list].sort((a, b) => {
      const catDiff = CATEGORY[a.category].order - CATEGORY[b.category].order;
      if (catDiff !== 0) return catDiff;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }
  function sortByDue(list) {
    return [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  function getFilteredSortedTasks() {
    let list = [...tasks];

    if (activeFilter.startsWith("cat:")) {
      const cat = activeFilter.slice(4);
      list = list.filter((t) => t.category === cat);
    } else if (activeFilter.startsWith("status:")) {
      const st = activeFilter.slice(7);
      list = list.filter((t) => t.status === st);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          (t.note || "").toLowerCase().includes(q)
      );
    }

    return sortMode === "due" ? sortByDue(list) : sortByPriority(list);
  }

  function renderTaskList() {
    renderFilterChips();
    sortSelect.value = sortMode;

    const list = getFilteredSortedTasks();
    tasksEmptyEl.hidden = list.length !== 0;
    taskListEl.hidden = list.length === 0;

    if (list.length === 0) {
      const noTasksAtAll = tasks.length === 0;
      tasksEmptyEl.innerHTML = `
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12h6m-6 4h4M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke-linejoin="round"/>
        </svg>
        <h3>${noTasksAtAll ? "ยังไม่มีการบ้านในระบบ" : "ไม่พบงานที่ตรงกับตัวกรอง"}</h3>
        <p>${noTasksAtAll ? "กดเมนู “เพิ่มการบ้าน” เพื่อเริ่มบันทึกงานชิ้นแรก" : "ลองเปลี่ยนตัวกรองหรือคำค้นหาดูใหม่"}</p>`;
      return;
    }

    taskListEl.innerHTML = list.map((t) => taskCardHTML(t)).join("");
    bindTaskCardEvents();
  }

  function taskCardHTML(t) {
    const cat = CATEGORY[t.category];
    const dm = dueMeta(t.dueDate);
    const st = STATUS[t.status];
    const isSubmitted = t.status === "submitted";
    return `
    <article class="task-card border-${cat.cls} ${isSubmitted ? "is-submitted" : ""}" data-id="${t.id}">
      <div class="task-main">
        <div class="task-top">
          <span class="task-subject">${escapeHTML(t.subject)}</span>
          ${t.type ? `<span class="task-type">· ${escapeHTML(t.type)}</span>` : ""}
        </div>
        <p class="task-title ${t.status === "done" || isSubmitted ? "is-done" : ""}">${escapeHTML(t.title)}</p>
        <div class="task-meta">
          <span class="due-chip ${dm.cls}">${dm.text} · ${formatThaiDate(t.dueDate)}${t.dueTime ? " " + t.dueTime + " น." : ""}</span>
          <span class="cat-badge cat-${cat.cls}-badge"><span class="dot"></span>${cat.label}</span>
          <span class="status-badge ${st.cls}">${st.label}</span>
        </div>
        ${t.note ? `<p class="task-note">📝 ${escapeHTML(t.note)}</p>` : ""}
      </div>
      <div class="task-actions">
        <select class="status-select" data-action="status" data-id="${t.id}" aria-label="เปลี่ยนสถานะงาน">
          ${STATUS_ORDER.map((s) => `<option value="${s}" ${s === t.status ? "selected" : ""}>${STATUS[s].label}</option>`).join("")}
        </select>
        <div class="icon-row">
          <button type="button" class="icon-btn" data-action="edit" data-id="${t.id}" title="แก้ไข" aria-label="แก้ไขงาน">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>
          </button>
          <button type="button" class="icon-btn danger" data-action="delete" data-id="${t.id}" title="ลบ" aria-label="ลบงาน">
            <svg viewBox="0 0 24 24"><path d="M6 7h12l-1 14H7L6 7Zm3-4h6l1 2H8l1-2Zm-4 2h14v2H5V5Z"/></svg>
          </button>
        </div>
      </div>
    </article>`;
  }

  function bindTaskCardEvents() {
    $$('[data-action="status"]', taskListEl).forEach((el) => {
      el.addEventListener("change", (e) => {
        updateStatus(e.target.dataset.id, e.target.value);
      });
    });
    $$('[data-action="edit"]', taskListEl).forEach((el) => {
      el.addEventListener("click", () => startEdit(el.dataset.id));
    });
    $$('[data-action="delete"]', taskListEl).forEach((el) => {
      el.addEventListener("click", () => openDeleteConfirm(el.dataset.id));
    });
  }

  /* =================================================================
     Notifications view
     ================================================================= */
  function renderNotifications() {
    const active = tasks.filter((t) => t.status !== "submitted");
    const overdue = sortByDue(active.filter((t) => dueMeta(t.dueDate).bucket === "over"));
    const today = sortByDue(active.filter((t) => dueMeta(t.dueDate).bucket === "today"));
    const soon = sortByDue(active.filter((t) => dueMeta(t.dueDate).bucket === "soon"));

    const groups = [
      { key: "over", cls: "group-over", title: "เลยกำหนดส่งแล้ว", list: overdue },
      { key: "today", cls: "group-today", title: "ถึงกำหนดส่งวันนี้", list: today },
      { key: "soon", cls: "group-soon", title: "ใกล้ถึงกำหนดส่ง (1-3 วัน)", list: soon },
    ];

    notifGroups.innerHTML = groups
      .map(
        (g) => `
      <div class="notif-group ${g.cls}">
        <h2>${g.title} <span class="count">${g.list.length}</span></h2>
        ${
          g.list.length
            ? `<div class="task-list">${g.list.map((t) => taskCardHTML(t)).join("")}</div>`
            : `<p class="notif-empty-line">ไม่มีงานในกลุ่มนี้</p>`
        }
      </div>`
      )
      .join("");

    bindTaskCardEvents();
  }

  /* =================================================================
     CRUD operations
     ================================================================= */
  function updateStatus(id, status) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.status = status;
    saveTasks();
    renderCurrentView();
    showToast(`อัปเดตสถานะเป็น “${STATUS[status].label}” แล้ว`, "success");
  }

  function startEdit(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    formId.value = t.id;
    fSubject.value = t.subject;
    fType.value = t.type || "";
    fTitle.value = t.title;
    fDate.value = t.dueDate;
    fTime.value = t.dueTime || "";
    fNote.value = t.note || "";
    const radio = $(`input[name="category"][value="${t.category}"]`);
    if (radio) radio.checked = true;

    formSubmitBtn.textContent = "บันทึกการแก้ไข";
    formCancelBtn.hidden = false;
    switchView("add");
  }

  function resetForm() {
    editingId = null;
    taskForm.reset();
    formId.value = "";
    formSubmitBtn.textContent = "เพิ่มการบ้าน";
    formCancelBtn.hidden = true;
  }

  function openDeleteConfirm(id) {
    pendingDeleteId = id;
    const t = tasks.find((x) => x.id === id);
    $("#confirm-body").textContent = t ? `ลบ “${t.title}” ออกจากรายการหรือไม่?` : "การลบจะไม่สามารถย้อนกลับได้";
    confirmOverlay.hidden = false;
  }
  function closeDeleteConfirm() {
    pendingDeleteId = null;
    confirmOverlay.hidden = true;
  }

  function deleteConfirmed() {
    if (!pendingDeleteId) return;
    tasks = tasks.filter((t) => t.id !== pendingDeleteId);
    saveTasks();
    closeDeleteConfirm();
    renderCurrentView();
    showToast("ลบงานเรียบร้อยแล้ว", "danger");
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const categoryInput = $('input[name="category"]:checked');

    if (!fSubject.value.trim() || !fTitle.value.trim() || !fDate.value || !categoryInput) {
      taskForm.reportValidity();
      return;
    }

    const payload = {
      subject: fSubject.value.trim(),
      title: fTitle.value.trim(),
      type: fType.value.trim(),
      dueDate: fDate.value,
      dueTime: fTime.value,
      note: fNote.value.trim(),
      category: categoryInput.value,
    };

    if (editingId) {
      const t = tasks.find((x) => x.id === editingId);
      Object.assign(t, payload);
      saveTasks();
      showToast("แก้ไขงานเรียบร้อยแล้ว", "success");
    } else {
      tasks.push({ id: uid(), status: "todo", createdAt: Date.now(), ...payload });
      saveTasks();
      showToast("เพิ่มการบ้านเรียบร้อยแล้ว", "success");
    }

    resetForm();
    switchView("tasks");
  }

  /* =================================================================
     Toast
     ================================================================= */
  function showToast(message, kind = "") {
    const el = document.createElement("div");
    el.className = `toast ${kind ? "toast-" + kind : ""}`;
    el.textContent = message;
    toastStack.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .25s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 260);
    }, 2200);
  }

  /* =================================================================
     Utils
     ================================================================= */
  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* =================================================================
     Event bindings
     ================================================================= */
  function bindGlobalEvents() {
    $$(".nav-item, .tab-item").forEach((el) => {
      el.addEventListener("click", () => switchView(el.dataset.view));
    });
    $$('[data-goto]').forEach((el) => {
      el.addEventListener("click", () => switchView(el.dataset.goto));
    });

    filterChipsEl.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      activeFilter = chip.dataset.filter;
      renderTaskList();
    });

    sortSelect.addEventListener("change", () => {
      sortMode = sortSelect.value;
      renderTaskList();
    });

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      renderTaskList();
    });

    taskForm.addEventListener("submit", handleFormSubmit);
    formCancelBtn.addEventListener("click", () => {
      resetForm();
      switchView("tasks");
    });

    confirmCancelBtn.addEventListener("click", closeDeleteConfirm);
    confirmDeleteBtn.addEventListener("click", deleteConfirmed);
    confirmOverlay.addEventListener("click", (e) => {
      if (e.target === confirmOverlay) closeDeleteConfirm();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !confirmOverlay.hidden) closeDeleteConfirm();
    });
  }

  /* =================================================================
     Init
     ================================================================= */
  function init() {
    loadTasks();
    bindGlobalEvents();
    switchView("dashboard");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
