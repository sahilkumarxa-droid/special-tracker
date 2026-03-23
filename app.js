const STORAGE_KEY = "saving-tracker.v2";
    const DEFAULT_CURRENCY = "\u20B9";
    const FIXED_START = "2026-03-10";
    const FIXED_END = "2026-08-31";
    const CHART_SRC = "https://cdn.jsdelivr.net/npm/chart.js";

    const state = {
      settings: {
        owner: "Daily Saver",
        dailyTarget: 300,
        currency: DEFAULT_CURRENCY,
        startDate: FIXED_START,
        endDate: FIXED_END,
        qrPeople: [
          { name: "Mansha Devi", img: "1.jpg" },
          { name: "Sagar Kumar", img: "2.jpg" }
        ]
      },
      entries: {},
      history: []
    };

    let chartInstance = null;
    let trendChartInstance = null;
    let chartScriptPromise = null;
    let activeTab = "dashboard";

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      });
    }

    function loadChartJs() {
      if (window.Chart) return Promise.resolve();
      if (chartScriptPromise) return chartScriptPromise;
      chartScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = CHART_SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          chartScriptPromise = null;
          reject(new Error("Chart load failed"));
        };
        document.head.appendChild(script);
      });
      return chartScriptPromise;
    }

    function toast(message) {
      const el = $("#toast");
      el.textContent = message;
      el.classList.add("show");
      setTimeout(() => el.classList.remove("show"), 2400);
    }

    let audioCtx = null;

    function playPop() {
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const now = audioCtx.currentTime;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        gain.connect(audioCtx.destination);

        const osc1 = audioCtx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(620, now);
        osc1.frequency.exponentialRampToValueAtTime(320, now + 0.16);

        const osc2 = audioCtx.createOscillator();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(860, now);
        osc2.frequency.exponentialRampToValueAtTime(360, now + 0.16);

        osc1.connect(gain);
        osc2.connect(gain);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.18);
        osc2.stop(now + 0.18);
      } catch (err) {
        return;
      }
    }

    function dateKey(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    function parseDate(input) {
      const [y, m, d] = input.split("-").map(Number);
      return new Date(y, m - 1, d);
    }

    function addDays(date, days) {
      const next = new Date(date);
      next.setDate(next.getDate() + days);
      return next;
    }

    function formatDisplay(date) {
      return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date);
    }

    function formatCurrency(value) {
      const symbol = state.settings.currency || DEFAULT_CURRENCY;
      return `${symbol}${Number(value).toLocaleString()}`;
    }

    function loadState() {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        state.settings.startDate = FIXED_START;
        state.settings.endDate = FIXED_END;
        return;
      }
      try {
        const parsed = JSON.parse(stored);
        Object.assign(state.settings, parsed.settings || {});
        state.entries = parsed.entries || {};
        state.history = parsed.history || [];
      } catch (err) {
        console.error(err);
      }

      if (!state.settings.startDate) state.settings.startDate = FIXED_START;
      if (!state.settings.endDate) state.settings.endDate = FIXED_END;

      let start = parseDate(state.settings.startDate);
      let end = parseDate(state.settings.endDate);
      const todayKey = dateKey(new Date());
      const today = parseDate(todayKey);
      const fallbackSpan = 100;
      if (isNaN(start.getTime())) {
        start = today;
        state.settings.startDate = todayKey;
      }
      if (isNaN(end.getTime())) {
        end = addDays(start, fallbackSpan);
        state.settings.endDate = dateKey(end);
      }

      const spanDays = Math.max(0, Math.round((end - start) / 86400000));

      const minStart = parseDate(FIXED_START);
      if (start < minStart) start = minStart, state.settings.startDate = FIXED_START;

      const minEnd = parseDate(FIXED_END);
      if (end < minEnd) end = minEnd, state.settings.endDate = FIXED_END;

      if (today < start) start = today, state.settings.startDate = todayKey;
      if (today > end) {
        start = today;
        end = addDays(today, spanDays || fallbackSpan);
        state.settings.startDate = todayKey;
        state.settings.endDate = dateKey(end);
      }

      if (start > end) {
        end = addDays(start, fallbackSpan);
        state.settings.endDate = dateKey(end);
      }

      Object.values(state.entries).forEach(entry => {
        if (entry && entry.amount && entry.amountLocked === undefined) {
          entry.amountLocked = true;
        }
      });
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function getDateRange() {
      const start = parseDate(state.settings.startDate);
      const end = parseDate(state.settings.endDate);
      const days = [];
      const current = new Date(start);
      let guard = 0;
      while (current <= end && guard < 900) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
        guard += 1;
      }
      return days;
    }

    function pushHistory(text) {
      state.history.unshift({ ts: new Date().toISOString(), text });
      saveState();
    }

    function renderOwner() {
      $("#ownerLine").textContent = `Welcome back, ${state.settings.owner}. Your tracker is ready.`;
      $("#todayLine").textContent = `Today: ${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
    }

    function renderStats(days) {
      const target = Number(state.settings.dailyTarget) || 0;
      const total = Object.values(state.entries).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
      const goal = target * days.length;
      const remaining = Math.max(0, goal - total);
      const avg = days.length ? total / days.length : 0;
      const best = Math.max(0, ...Object.values(state.entries).map(entry => Number(entry.amount) || 0));
      const completed = days.filter(d => state.entries[dateKey(d)]?.done).length;
      const completionRate = days.length ? Math.round((completed / days.length) * 100) : 0;

      $("#statTotal").textContent = formatCurrency(total);
      $("#statRemaining").textContent = formatCurrency(remaining);
      $("#statAverage").textContent = formatCurrency(target);
      $("#statBest").textContent = formatCurrency(best);
      $("#statCompletion").textContent = `${completionRate}%`;

      const streak = calcStreak(days);
      $("#statStreak").textContent = `${streak} days`;

      const progress = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
      $("#progressTotal").style.width = `${progress}%`;
    }

    function renderMonthlyTotals(days) {
      const target = Number(state.settings.dailyTarget) || 0;
      const monthly = new Map();
      days.forEach(d => {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthly.has(key)) monthly.set(key, { days: 0, saved: 0, label: d.toLocaleString(undefined, { month: "long", year: "numeric" }) });
        const bucket = monthly.get(key);
        bucket.days += 1;
        bucket.saved += Number(state.entries[dateKey(d)]?.amount) || 0;
      });

      const grid = $("#monthlyGrid");
      grid.innerHTML = "";
      monthly.forEach((bucket, key) => {
        const planned = target * bucket.days;
        const card = document.createElement("div");
        card.className = "month-card";
        card.innerHTML = `
          <strong>${bucket.label}</strong>
          <span>Planned: ${formatCurrency(planned)}</span>
          <span>Saved: ${formatCurrency(bucket.saved)}</span>
        `;
        grid.appendChild(card);
      });
    }

    function calcStreak(days) {
      const todayKey = dateKey(new Date());
      let startIndex = days.findIndex(d => dateKey(d) === todayKey);
      if (startIndex === -1) startIndex = days.length - 1;
      let streak = 0;
      for (let i = startIndex; i >= 0; i--) {
        const key = dateKey(days[i]);
        if (state.entries[key]?.done) streak += 1;
        else break;
      }
      return streak;
    }

    function renderTable(days) {
      const tbody = $("#tableBody");
      tbody.innerHTML = "";
      const target = Number(state.settings.dailyTarget) || 0;
      const todayKey = dateKey(new Date());

      days.forEach(date => {
        const key = dateKey(date);
        const entry = state.entries[key] || {};
        const amount = entry.amount ?? "";
        const amountNumber = Number(entry.amount) || 0;
        const ratio = target > 0 ? Math.min(1, amountNumber / target) : 0;
        const statusText = amountNumber >= target && target > 0 ? "Met" : amountNumber > 0 ? "Short" : "Empty";
        const statusClass = amountNumber >= target && target > 0 ? "good" : amountNumber > 0 ? "warn" : "";
        const isToday = key === todayKey;
        const isEditableDay = isToday;
        const amountLocked = entry.amountLocked === undefined ? !!entry.amount : !!entry.amountLocked;
        const amountDisabledAttr = isEditableDay && !amountLocked ? "" : "disabled";
        const checkDisabledAttr = isEditableDay ? "" : "disabled";

        const row = document.createElement("tr");
        row.dataset.date = key;
        row.className = isToday ? "" : "locked";
        if (isToday) row.classList.add("today-row");
        if (amountLocked) row.classList.add("amount-locked");
        row.innerHTML = `
          <td>${formatDisplay(date)} ${isToday ? '<span class="today-pill">TODAY</span>' : '<span class="lock-pill">LOCKED</span>'}</td>
          <td>${formatCurrency(target)}</td>
          <td>
            <div class="input-row">
              <input type="number" min="0" value="${amount}" ${amountDisabledAttr}>
              <button class="mini-btn secondary save-btn" ${amountDisabledAttr}>Save</button>
              <button class="mini-btn ghost clear-btn" ${amountDisabledAttr}>Clear</button>
            </div>
          </td>
          <td>
            <label class="switch">
              <input type="checkbox" ${entry.done ? "checked" : ""} ${checkDisabledAttr}>
              <span class="slider"></span>
            </label>
          </td>
          <td>
            <span class="status ${statusClass}">${statusText}</span>
            <div class="mini-bar"><span style="width:${ratio * 100}%"></span></div>
          </td>
        `;
        tbody.appendChild(row);
      });
    }

    function renderHistory() {
      const list = $("#historyList");
      const query = $("#historySearch").value.toLowerCase();
      list.innerHTML = "";
      const filtered = state.history.filter(item => item.text.toLowerCase().includes(query));
      if (!filtered.length) {
        const li = document.createElement("li");
        li.className = "history-item";
        li.textContent = "No history entries yet.";
        list.appendChild(li);
        return;
      }
      filtered.forEach(item => {
        const li = document.createElement("li");
        li.className = "history-item";
        const time = new Date(item.ts).toLocaleString();
        li.innerHTML = `<span>${item.text}</span><span>${time}</span>`;
        list.appendChild(li);
      });
    }

    function renderQr() {
      const grid = $("#qrGrid");
      grid.innerHTML = "";
        state.settings.qrPeople.forEach(person => {
        const card = document.createElement("div");
        card.className = "qr-card";
        card.innerHTML = `
          <h3>${person.name}</h3>
          <img src="${person.img}" alt="${person.name} QR" loading="lazy" decoding="async">
        `;
        grid.appendChild(card);
      });
    }

    function renderChart(days) {
      const labels = days.map(d => formatDisplay(d));
      const daily = days.map(d => Number(state.entries[dateKey(d)]?.amount) || 0);
      const cumulative = [];
      daily.reduce((sum, val, idx) => {
        cumulative[idx] = sum + val;
        return cumulative[idx];
      }, 0);

      const ctx = document.getElementById("chart").getContext("2d");
      if (chartInstance) chartInstance.destroy();
      chartInstance = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Daily Saved",
              data: daily,
              backgroundColor: "rgba(194, 118, 43, 0.45)",
              borderRadius: 6
            },
            {
              label: "Cumulative",
              data: cumulative,
              type: "line",
              borderColor: "#0f5c4e",
              backgroundColor: "rgba(15, 92, 78, 0.1)",
              borderWidth: 2,
              pointRadius: 2,
              yAxisID: "y1"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom" }
          },
          scales: {
            y: { beginAtZero: true },
            y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } }
          }
        }
      });
    }

    function renderTrendChart(days) {
      const labels = days.map(d => formatDisplay(d));
      const daily = days.map(d => Number(state.entries[dateKey(d)]?.amount) || 0);
      const target = Number(state.settings.dailyTarget) || 0;
      const targetLine = days.map(() => target);

      const ctx = document.getElementById("chart2").getContext("2d");
      if (trendChartInstance) trendChartInstance.destroy();
      trendChartInstance = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Daily Saved",
              data: daily,
              borderColor: "#c2762b",
              backgroundColor: "rgba(194, 118, 43, 0.15)",
              borderWidth: 2,
              pointRadius: 2,
              tension: 0.3
            },
            {
              label: "Daily Target",
              data: targetLine,
              borderColor: "#0f5c4e",
              borderDash: [6, 6],
              borderWidth: 2,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom" }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }

    function renderCharts(days) {
      const wantsInsights = activeTab === "insights";
      const wantsGraphs = activeTab === "graphs";
      if (!wantsInsights && !wantsGraphs) return;

      const run = () => {
        loadChartJs()
          .then(() => {
            if (wantsInsights) renderChart(days);
            if (wantsGraphs) renderTrendChart(days);
          })
          .catch(() => {});
      };

      if ("requestIdleCallback" in window) {
        requestIdleCallback(run, { timeout: 1200 });
      } else {
        setTimeout(run, 0);
      }
    }

    function renderAll() {
      const days = getDateRange();
      renderOwner();
      renderStats(days);
      renderMonthlyTotals(days);
      renderTable(days);
      renderHistory();
      renderQr();
      renderCharts(days);
      const todayRow = $("#tableBody tr.today-row");
      if (todayRow) todayRow.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    function setActiveTab(tab) {
      activeTab = tab;
      $$(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
      $$(".panel").forEach(panel => panel.classList.toggle("hidden", panel.id !== `tab-${tab}`));
      renderCharts(getDateRange());
    }

    function bindEvents() {
      $("#tableBody").addEventListener("click", event => {
        const row = event.target.closest("tr");
        if (!row) return;
        const key = row.dataset.date;
        const input = row.querySelector("input[type='number']");
        const todayKey = dateKey(new Date());

        if (event.target.classList.contains("save-btn")) {
          if (key !== todayKey) return;
          if (state.entries[key]?.amountLocked) return;
          const value = Number(input.value);
          if (!value) {
            toast("Enter an amount first.");
            return;
          }
          if (!state.entries[key]) state.entries[key] = {};
          state.entries[key].amount = value;
          state.entries[key].amountLocked = true;
          pushHistory(`Saved ${formatCurrency(value)} for ${key}`);
          saveState();
          playPop();
          renderAll();
          toast("Saved.");
        }

        if (event.target.classList.contains("clear-btn")) {
          if (key !== todayKey) return;
          input.value = "";
          if (state.entries[key]) {
            delete state.entries[key].amount;
            delete state.entries[key].amountLocked;
            saveState();
            renderAll();
          }
        }
      });

      $("#tableBody").addEventListener("change", event => {
        if (event.target.type !== "checkbox") return;
        const row = event.target.closest("tr");
        const key = row.dataset.date;
        const todayKey = dateKey(new Date());
        if (key !== todayKey) return;
        if (!state.entries[key]) state.entries[key] = {};
        state.entries[key].done = event.target.checked;
        if (event.target.checked && !state.entries[key].amount) {
          state.entries[key].amount = Number(state.settings.dailyTarget) || 0;
          pushHistory(`Auto-filled ${formatCurrency(state.entries[key].amount)} for ${key}`);
        }
        pushHistory(`Marked ${key} as ${event.target.checked ? "done" : "not done"}`);
        if (event.target.checked) {
          playPop();
        }
        saveState();
        renderAll();
      });

      $$(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
      });

      $("#quickSave").addEventListener("click", () => {
        const val = Number($("#quickAmount").value);
        if (!val) {
          toast("Enter today's amount.");
          return;
        }
        const today = dateKey(new Date());
        if (!state.entries[today]) state.entries[today] = {};
        state.entries[today].amount = val;
        state.entries[today].amountLocked = true;
        pushHistory(`Quick saved ${formatCurrency(val)} for ${today}`);
        saveState();
        playPop();
        renderAll();
        $("#quickAmount").value = "";
      });

      const copyBtn = $("#copyApkLink");
      if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
          const url = new URL("Special-Tracker-signed.apk", window.location.href).toString();
          try {
            await navigator.clipboard.writeText(url);
            toast("APK link copied.");
          } catch (err) {
            window.prompt("Copy APK link:", url);
          }
        });
      }

      $("#exportBtn").addEventListener("click", () => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "saving-tracker-backup.json";
        link.click();
        URL.revokeObjectURL(url);
      });

      $("#importBtn").addEventListener("click", () => $("#importFile").click());

      $("#importFile").addEventListener("change", event => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const incoming = JSON.parse(reader.result);
            Object.assign(state.settings, incoming.settings || {});
            state.entries = incoming.entries || {};
            state.history = incoming.history || [];
            saveState();
            renderAll();
            toast("Backup imported.");
          } catch (err) {
            toast("Import failed.");
          }
        };
        reader.readAsText(file);
      });

      $("#resetBtn").addEventListener("click", () => {
        if (!confirm("Reset all saved data?")) return;
        state.entries = {};
        state.history = [];
        saveState();
        renderAll();
        toast("Data reset.");
      });

      $("#historySearch").addEventListener("input", renderHistory);
      $("#clearHistory").addEventListener("click", () => {
        if (!confirm("Clear history log?")) return;
        state.history = [];
        saveState();
        renderHistory();
      });

      const dialog = $("#settingsDialog");
      $("#openSettings").addEventListener("click", () => {
        $("#settingOwner").value = state.settings.owner || "";
        $("#settingTarget").value = state.settings.dailyTarget || 0;
        $("#settingCurrency").value = state.settings.currency || DEFAULT_CURRENCY;
        $("#settingStart").value = state.settings.startDate;
        $("#settingEnd").value = state.settings.endDate;
        $("#settingQr1").value = state.settings.qrPeople[0]?.name || "";
        $("#settingQr2").value = state.settings.qrPeople[1]?.name || "";
        dialog.showModal();
      });

      $("#closeSettings").addEventListener("click", () => dialog.close());

      $("#saveSettings").addEventListener("click", () => {
        const start = $("#settingStart").value;
        const end = $("#settingEnd").value;
        if (!start || !end) {
          toast("Pick a start and end date.");
          return;
        }
        if (parseDate(start) > parseDate(end)) {
          toast("End date must be after start date.");
          return;
        }
        state.settings.owner = $("#settingOwner").value || "Daily Saver";
        state.settings.dailyTarget = Number($("#settingTarget").value) || 0;
        state.settings.currency = $("#settingCurrency").value || DEFAULT_CURRENCY;
        state.settings.startDate = start;
        state.settings.endDate = end;
        state.settings.qrPeople = [
          { name: $("#settingQr1").value || "Mansha Devi", img: "1.jpg" },
          { name: $("#settingQr2").value || "Sagar Kumar", img: "2.jpg" }
        ];
        saveState();
        renderAll();
        dialog.close();
      });
    }

    /* AUTH SYSTEM */

    const DEMO_USER = "demo";
    const DEMO_PASS = "demo123";

    function ensureDemoAccount() {
      const existing = localStorage.getItem("trackerUser");
      const existingPass = localStorage.getItem("trackerPass");
      if (!existing || !existingPass) {
        localStorage.setItem("trackerUser", DEMO_USER);
        localStorage.setItem("trackerPass", DEMO_PASS);
        localStorage.setItem("trackerIsDemo", "1");
      }
    }

    function signup() {
      const u = document.getElementById("signupUser").value;
      const p = document.getElementById("signupPass").value;

      if (!u || !p) {
        alert("Enter username and password");
        return;
      }

      localStorage.setItem("trackerUser", u);
      localStorage.setItem("trackerPass", p);
      localStorage.removeItem("trackerIsDemo");

      alert("Account Created");
    }

    function login() {
      const u = document.getElementById("loginUser").value;
      const p = document.getElementById("loginPass").value;

      const su = localStorage.getItem("trackerUser");
      const sp = localStorage.getItem("trackerPass");

      if (u === su && p === sp) {
        document.getElementById("authScreen").style.display = "none";
      } else {
        alert("Wrong login");
      }
    }

    function loginDemo() {
      localStorage.setItem("trackerUser", DEMO_USER);
      localStorage.setItem("trackerPass", DEMO_PASS);
      localStorage.setItem("trackerIsDemo", "1");
      document.getElementById("loginUser").value = DEMO_USER;
      document.getElementById("loginPass").value = DEMO_PASS;
      document.getElementById("authScreen").style.display = "none";
    }

    function logout() {
      document.getElementById("authScreen").style.display = "flex";
    }

    /* LOCK ON START */

    window.addEventListener("load", () => {
      ensureDemoAccount();
      document.getElementById("authScreen").style.display = "flex";
    });

    loadState();
    bindEvents();
    renderAll();
