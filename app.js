const BASE = "https://lms.kgma.kg/vm/api";
const ID_YEAR = 25;

// State management
let state = {
    id_student: null,
    id_group: null,
    student_fio: "",
    disciplineGroups: {}, // Grouped by Base Name: { "Анатомия": [ {id, tag, vids: []} ] }
    currentDiscipline: null,
    currentVid: null,
    currentJournal: []
};

// Visual Telemetry Queue
let statusQueue = [];
let isProcessingQueue = false;

// UI Elements
const els = {
    login: document.getElementById("login"),
    ws: document.getElementById("id-ws"),
    loadBtn: document.getElementById("load-btn"),
    studentName: document.getElementById("student-name"),
    statusLine: document.getElementById("status-line"),
    terminal: document.getElementById("terminal-content"),
    selectionArea: document.getElementById("selection-area"),
    discSelect: document.getElementById("discipline-select"),
    typeSelect: document.getElementById("type-select"),
    teacherInfo: document.getElementById("teacher-info"),
    tableContainer: document.getElementById("table-container"),
    tableBody: document.getElementById("journal-body"),
    moduleSelect: document.getElementById("module-select"),
    modalMark: document.getElementById("modal-mark"),
    modal: document.getElementById("modal-overlay"),
    modalDetails: document.getElementById("modal-details"),
    closeModal: document.getElementById("close-modal"),
    history: document.getElementById("login-history"),
    led: document.getElementById("led"),
    studentSearch: document.getElementById("student-search"),
    searchResults: document.getElementById("search-results"),
    searchItems: document.getElementById("search-items")
};

// Student search data
let studentsData = {};
let searchTimeout = null;

async function loadStudentsData() {
    try {
        const res = await fetch("students.json");
        const data = await res.json();
        const count = Object.keys(data).length;
        studentsData = data;
        log(`Students index loaded: ${count} records`, "ok");
        toggleStudentSearch(true);
    } catch (e) {
        log("Failed to load students.json", "error");
    }
}

function parseFIO(fio) {
    const parts = fio.trim().split(/\s+/);
    return {
        surname: parts[0] || "",
        name: parts[1] || "",
        patronymic: parts.slice(2).join(" ") || ""
    };
}

function matchesSearch(query, fio) {
    if (!query || !query.trim()) return false;

    const orig = query;
    const q = query.trim();
    const { surname, name, patronymic } = parseFIO(fio);

    const tSurname = surname.toLowerCase();
    const tName = name.toLowerCase();
    const tPatronymic = patronymic.toLowerCase();
    const hasTrailingSpace = orig.endsWith(' ');

    if (hasTrailingSpace) {
        const parts = q.split(/\s+/);
        const lastIdx = parts.length - 1;

        return parts.every((part, idx) => {
            const term = part.toLowerCase();
            if (idx === lastIdx) {
                return tSurname === term || tName === term || tPatronymic === term;
            }
            return tSurname === term || tName === term || tPatronymic === term;
        });
    } else if (q.includes(' ')) {
        const parts = q.split(/\s+/);
        const lastIdx = parts.length - 1;

        return parts.every((part, idx) => {
            const term = part.toLowerCase();
            if (idx === lastIdx) {
                return tSurname.startsWith(term) ||
                       tName.startsWith(term) ||
                       tPatronymic.startsWith(term);
            }
            return tSurname === term || tName === term || tPatronymic === term;
        });
    } else {
        const term = q.toLowerCase();
        return tSurname.startsWith(term) ||
               tName.startsWith(term) ||
               tPatronymic.startsWith(term);
    }
}

function performSearch(query) {
    const results = [];
    for (const [id, fio] of Object.entries(studentsData)) {
        if (matchesSearch(query, fio)) {
            results.push({ id, fio });
            if (results.length >= 20) break;
        }
    }
    return results;
}

function renderSearchResults(results) {
    if (results.length === 0) {
        els.searchResults.classList.add("hidden");
        return;
    }
    els.searchItems.innerHTML = results.map(r => `
        <div class="history-item" data-id="${r.id}" data-fio="${r.fio}">
            <span class="history-val">${r.id}</span>
            <span class="fio-val" style="color:var(--text)">${r.fio}</span>
        </div>
    `).join("");
    els.searchResults.classList.remove("hidden");
}

function handleSearchInput(isWideScreen) {
    const query = els.studentSearch.value.trim();
    if (!query || query.length < 2) {
        els.searchResults.classList.add("hidden");
        return;
    }
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    if (isWideScreen) {
        const results = performSearch(query);
        renderSearchResults(results);
    } else {
        searchTimeout = setTimeout(() => {
            const results = performSearch(query);
            renderSearchResults(results);
        }, 500);
    }
}

els.studentSearch.addEventListener("input", () => handleSearchInput(window.innerWidth > 850));
els.studentSearch.addEventListener("focus", () => handleSearchInput(window.innerWidth > 850));
window.addEventListener("resize", () => {
    const query = els.studentSearch.value.trim();
    if (query.length >= 2) handleSearchInput(window.innerWidth > 850);
});

els.searchResults.addEventListener("click", (e) => {
    const item = e.target.closest(".history-item");
    if (item) {
        const id = item.dataset.id;
        const fio = item.dataset.fio;
        els.login.value = id;
        els.studentSearch.value = "";
        els.searchResults.classList.add("hidden");
        toggleStudentSearch(false);
        startInjection();
    }
});

document.addEventListener("click", (e) => {
    if (!els.studentSearch.contains(e.target) && !els.searchResults.contains(e.target)) {
        els.searchResults.classList.add("hidden");
    }
});

// Logger
function log(msg, type = "info") {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.className = "log-line";
    line.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg ${type}">${msg}</span>`;
    els.terminal.appendChild(line);
    els.terminal.scrollTop = els.terminal.scrollHeight;
}

function updateStatus(msg) {
    statusQueue.push(msg);
    if (!isProcessingQueue) {
        processStatusQueue();
    }
}

async function processStatusQueue() {
    isProcessingQueue = true;
    while (statusQueue.length > 0) {
        const msg = statusQueue.shift();
        
        const entry = document.createElement("div");
        entry.className = "status-entry";
        entry.textContent = msg;
        els.statusLine.appendChild(entry);
        
        // Pacing: ~60ms for smooth high-speed telemetry
        await new Promise(r => setTimeout(r, 60));
    }
    isProcessingQueue = false;
}

function setSystemState(stateType) {
    els.led.className = "led"; // Reset
    switch(stateType) {
        case 'waiting':
            els.led.classList.add("led-waiting");
            break;
        case 'busy':
            els.led.classList.add("led-busy");
            break;
        case 'ready':
            els.led.classList.add("led-ready");
            break;
    }
}

// Date Formatter: converts DD.MM.YYYY or YYYY-MM-DD to YYYY-MM-DD
function formatDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes(".")) {
        const parts = dateStr.split(".");
        if (parts[0].length === 2) {
            let year = parts[2];
            if (year.length === 2) year = "20" + year;
            return `${year}-${parts[1]}-${parts[0]}`;
        }
    }
    return dateStr;
}

// API Helper
async function fetchJSON(url, options = {}) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.data || [];
    } catch (e) {
        log(`API Error: ${e.message}`, "error");
        throw e;
    }
}

// Initialization and Event Listeners
els.loadBtn.onclick = startInjection;
els.login.onkeydown = (e) => {
    if (e.key === "Enter") startInjection();
};
// els.login.focus(); // Removed as requested to allow native autocomplete

els.discSelect.onchange = () => {
    const discId = els.discSelect.value;
    state.currentDiscipline = state.disciplines.find(d => d.id == discId);
    populateTypes(state.currentDiscipline);
};

els.typeSelect.onchange = () => {
    const vidId = els.typeSelect.value;
    state.currentVid = state.currentDiscipline.vids.find(v => v.id == vidId);
    showJournal(state.currentVid);
};

els.closeModal.onclick = () => els.modal.classList.add("hidden");

async function startInjection() {
    const login = els.login.value.trim();
    if (!login.includes("-")) {
        alert("FORMAT ERROR: X-YYYYY required.");
        return;
    }

    state.id_student = login.split("-")[1];
    const id_ws = els.ws.value;

    // MANDATORY: Full UI Reset for new session
    setSystemState('busy');
    els.selectionArea.classList.add("hidden");
    els.tableContainer.classList.add("hidden");
    els.studentName.textContent = "—";
    els.teacherInfo.innerHTML = "";
    els.statusLine.innerHTML = ""; // Clear mini-terminal
    document.getElementById("terminal-content").innerHTML = "";

    log(`Initializing connection for student ID: ${state.id_student}...`);
    updateStatus("ACCESSING SYSTEM CORE...");

    try {
        // 1. Get User info
        const user = await fetchJSON(`${BASE}/user?id_user=${state.id_student}&id_avn=-1&id_role=2`);
        state.id_group = user.id_group;
        state.student_fio = `${user.surname} ${user.name} ${user.patronymic}`.trim();
        
        saveLogin(login);
        toggleStudentSearch(false);

        els.studentName.textContent = state.student_fio;
        log(`LOGIN OK: ${state.student_fio}`, "ok");

        // 2. Get Semester
        updateStatus("FETCHING SEMESTER DATA...");
        const semesterData = await fetchJSON(`${BASE}/student/semester/?id_year=${ID_YEAR}&id_ws=${id_ws}&id_group=${state.id_group}&id_student=${state.id_student}`);
        
        if (!semesterData || semesterData.length === 0) {
            log("CRITICAL: No semester data found for this student/WS. Check academic year.", "error");
            throw new Error("SEMESTER_NOT_FOUND");
        }
        
        const id_semester = semesterData[0].id_semester;
        log(`SEMESTER DETECTED: ID ${id_semester}`, "ok");

        // 3. Get Disciplines
        updateStatus("SCANNING DISCIPLINES...");
        const rawDisciplines = await fetchJSON(`${BASE}/student/discipline/?id_year=${ID_YEAR}&id_ws=${id_ws}&id_group=${state.id_group}&id_student=${state.id_student}&id_semester=${id_semester}`);
        
        state.disciplineGroups = {};
        saveLogin(login);
        
        log(`Intercepted ${rawDisciplines.length} raw data strings. Analyzing hierarchy...`);
        let failedCount = 0;

        await Promise.all(rawDisciplines.map(async (disc) => {
            const tagMatch = disc.discipline.match(/^\[(.*?)\]\s*(.*)/);
            let tag = tagMatch ? `[${tagMatch[1]}]` : "";
            let rawName = tagMatch ? tagMatch[2] : disc.discipline;
            
            // Extract credit from string like "(крд. 0.35)" or "(крд.-2)"
            const creditMatch = rawName.match(/\(крд[^\d]*([\d.]+)\)/i);
            const parsedCredit = creditMatch ? parseFloat(creditMatch[1]) : 0;
            
            let baseName = rawName.replace(/\(крд.*$/g, "").trim();
            
            try {
                updateStatus(`PARSING: ${baseName}`);
                const vids = await fetchJSON(`${BASE}/student/vid-zanyatie?id_year=${ID_YEAR}&id_ws=${id_ws}&id_group=${state.id_group}&id_student=${state.id_student}&id_semester=${id_semester}&id_discipline=${disc.id_discipline}`);
                
                const discObj = {
                    id: disc.id_discipline,
                    baseName: baseName,
                    tag: tag,
                    isSelect: disc.isSelect || 0,
                    credit: parsedCredit || disc.Krdt || 0,
                    id_semester: id_semester,
                    vids: []
                };

                await Promise.all(vids.map(async (vid) => {
                    const teachers = await fetchJSON(`${BASE}/student/teacher/?id_year=${ID_YEAR}&id_ws=${id_ws}&id_group=${state.id_group}&id_student=${state.id_student}&id_discipline=${disc.id_discipline}&id_semester=${id_semester}&id_vid_zaniatiy=${vid.id_vid_zaniatiy}`);
                    
                    const vidObj = {
                        id: vid.id_vid_zaniatiy,
                        name: vid.vid_zaniatiy,
                        teachers: teachers.map(t => ({ id: t.id_teacher, name: t.t_fio })),
                        journal: []
                    };

                    for (const teacher of teachers) {
                        const journal = await fetchJSON(`${BASE}/student/journal?id_year=${ID_YEAR}&id_ws=${id_ws}&id_group=${state.id_group}&id_student=${state.id_student}&id_discipline=${disc.id_discipline}&id_vid_zaniatiy=${vid.id_vid_zaniatiy}&id_semester=${id_semester}&id_teacher=${teacher.id_teacher}`);
                        vidObj.journal.push(...journal.map(row => ({
                            ...row,
                            id_teacher: teacher.id_teacher,
                            teacher_name: teacher.t_fio,
                            id_discipline: disc.id_discipline,
                            id_vid_zaniatiy: vid.id_vid_zaniatiy,
                            id_semester: id_semester,
                            id_ws: id_ws
                        })));
                    }
                    discObj.vids.push(vidObj);
                }));

                if (!state.disciplineGroups[baseName]) state.disciplineGroups[baseName] = [];
                state.disciplineGroups[baseName].push(discObj);

            } catch (e) {
                failedCount++;
                log(`Skipping [${baseName}]: Server returned 500 error during deep scan.`, "error");
                // Mark as error item
                if (!state.disciplineGroups[baseName]) state.disciplineGroups[baseName] = [];
                state.disciplineGroups[baseName].push({ baseName, corrupted: true });
            }
        }));

        if (failedCount > 0) {
            log(`Scan complete with ${failedCount} server-side failures. Broken items marked.`, "error");
        } else {
            log("Hierarchy analysis complete. All targets secured.", "ok");
        }

        // Wait for visual buffer to empty so the user sees everything
        while (statusQueue.length > 0 || isProcessingQueue) {
            await new Promise(r => setTimeout(r, 100));
        }

        setSystemState('ready');
        updateStatus("SYSTEM READY.");
        populateDisciplines();
        els.selectionArea.classList.remove("hidden");

    } catch (e) {
        log(`CRITICAL FAILURE during scan: ${e.message}`, "error");
        setSystemState('waiting');
        updateStatus("SCAN ABORTED.");
    }
}

function populateDisciplines() {
    els.discSelect.innerHTML = '<option value="" disabled selected>Предмет...</option>';
    const sortedBases = Object.keys(state.disciplineGroups).sort((a, b) => a.localeCompare(b));
    sortedBases.forEach(baseName => {
        const variants = state.disciplineGroups[baseName];
        const isAllCorrupted = variants.every(v => v.corrupted);
        
        const opt = document.createElement("option");
        opt.value = baseName;
        opt.textContent = isAllCorrupted ? `[!!! SERVER ERROR !!!] ${baseName}` : baseName;
        if (isAllCorrupted) {
            opt.style.color = "#f44";
        }
        els.discSelect.appendChild(opt);
    });
}

els.discSelect.onchange = () => {
    const baseName = els.discSelect.value;
    const variants = state.disciplineGroups[baseName];
    const isAllCorrupted = variants.every(v => v.corrupted);

    // MANTATORY: Clear UI on any subject change
    els.tableContainer.classList.add("hidden");
    els.teacherInfo.innerHTML = "";

    if (isAllCorrupted) {
        els.moduleSelect.classList.add("hidden");
        els.typeSelect.disabled = true;
        els.teacherInfo.innerHTML = `<span style="color:#f44">FATAL: This discipline is currently inaccessible due to Server 500 Error.</span>`;
        return;
    }

    const cleanVariants = variants.filter(v => !v.corrupted);

    if (cleanVariants.length > 1) {
        // Show module select
        els.moduleSelect.innerHTML = '<option value="" disabled selected>Модуль...</option>';
        cleanVariants.forEach(variant => {
            const opt = document.createElement("option");
            opt.value = variant.id;
            opt.textContent = variant.tag || "[ОСНОВНОЙ]";
            els.moduleSelect.appendChild(opt);
        });
        els.moduleSelect.classList.remove("hidden");
        els.typeSelect.disabled = true;
        els.typeSelect.innerHTML = '<option value="" disabled selected>Тип...</option>';
        state.currentDiscipline = null;
    } else {
        // Only one variant
        els.moduleSelect.classList.add("hidden");
        state.currentDiscipline = cleanVariants[0];
        autoSelectType(state.currentDiscipline);
    }
};

els.moduleSelect.onchange = () => {
    const discId = els.moduleSelect.value;
    const baseName = els.discSelect.value;
    state.currentDiscipline = state.disciplineGroups[baseName].find(d => d.id == discId);
    autoSelectType(state.currentDiscipline);
};

function autoSelectType(disc) {
    // Clear old state before decision
    els.tableContainer.classList.add("hidden");
    els.teacherInfo.innerHTML = "";
    
    // Filter out types with empty journals
    const validVids = disc.vids.filter(v => v.journal.length > 0);
    
    if (validVids.length === 0) {
        els.typeSelect.disabled = true;
        els.typeSelect.innerHTML = '<option value="" disabled selected>Нет данных</option>';
        els.teacherInfo.innerHTML = `<span style="color:var(--orange)">No journal data available for this target.</span>`;
        return;
    }

    populateTypes(validVids);

    if (validVids.length === 1) {
        // AUTOPILOT: Only one type exists, open it!
        state.currentVid = validVids[0];
        els.typeSelect.value = validVids[0].id;
        els.typeSelect.disabled = true; // Lock it as there is no choice
        showJournal(validVids[0]);
    } else {
        // Selection required
        els.typeSelect.disabled = false;
        els.typeSelect.innerHTML = '<option value="" disabled selected>Выбрать тип...</option>' + els.typeSelect.innerHTML;
        els.typeSelect.value = "";
    }
}

function populateTypes(vids) {
    els.typeSelect.innerHTML = vids.map(vid => `<option value="${vid.id}">${vid.name}</option>`).join("");
}

els.typeSelect.onchange = () => {
    const vidId = els.typeSelect.value;
    const vid = state.currentDiscipline.vids.find(v => v.id == vidId);
    if (vid) {
        state.currentVid = vid;
        showJournal(vid);
    }
};

function showJournal(vid) {
    els.tableBody.innerHTML = "";
    els.tableContainer.classList.remove("hidden");
    
    // Set teacher info from first entry if exists
    if (vid.journal.length > 0) {
        els.teacherInfo.textContent = `TEACHER: ${vid.journal[0].teacher_name}`;
    }

    vid.journal.forEach((row, idx) => {
        const tr = document.createElement("tr");
        const mark = row.otsenka || row.otsenka_ball || "—";
        const isBad = mark === "н/б" || mark === "1" || mark === "2" || mark === "д";

        tr.innerHTML = `
            <td>№${idx + 1} – ${row.lesson_topic ? row.lesson_topic.trim() : "Untitled"}</td>
            <td>${row.visitDate || "—"}</td>
            <td class="mark-cell ${isBad ? 'bad' : ''}" data-idx="${idx}">${mark}</td>
        `;
        
        tr.querySelector(".mark-cell").onclick = () => openEditModal(row, idx);
        els.tableBody.appendChild(tr);
    });
}

const MARK_MAP = [
    { id: 5, label: "5 (Excellent)" },
    { id: 4, label: "4 (Good)" },
    { id: 3, label: "3 (Satisfactory)" },
    { id: 2, label: "2 (Unsatisfactory)" },
    { id: 1, label: "1 (Fail)" },
    { id: 6, label: "н/б (Absent)" },
    { id: 7, label: "н/б 3 (Absent/Late)" },
    { id: 8, label: "CLEAR (Null)" }
];

async function openEditModal(row, rowIdx) {
    els.modal.classList.remove("hidden");
    els.modalMark.innerHTML = MARK_MAP.map(m => `<option value="${m.id}" ${m.id === 5 ? 'selected' : ''}>${m.label}</option>`).join("");
    
    let topicStatus = "SCANNING...";
    let finalTopicId = null;

    const renderPayload = () => {
        const selectedId = els.modalMark.value;
        const isoDate = formatDate(row.visitDate);

        // Build Payload Object
        const payload = {
            "id_teacher": parseInt(row.id_teacher),
            "id_student": parseInt(state.id_student),
            "id_discipline": parseInt(row.id_discipline),
            "id_vid_zaniatiy": parseInt(row.id_vid_zaniatiy),
            "id_groupOrPorok": parseInt(state.id_group),
            "visitDate": `${isoDate}T00:00:00.000Z`,
            "id_otsenka": parseInt(selectedId),
            "id_modul": 1,
            "id_year": ID_YEAR,
            "isPotok": 0,
            "id_semesterOrWs": state.currentDiscipline.id_semester,
            "timesCount": 1,
            "isVisited": true,
            "credit": state.currentDiscipline.credit,
            "id_time": -1,
            "subgroup": null,
            "typeGroup": 0,
            "attempt": 0
        };

        // Add Topic ID ONLY if synced
        if (finalTopicId !== null) {
            payload["id_lesson_topic"] = finalTopicId;
        }

        els.modalDetails.innerHTML = `
            <p><span style="color:var(--cyan-dim)">DISCIPLINE:</span> ${els.discSelect.options[els.discSelect.selectedIndex].text}</p>
            <p><span style="color:var(--cyan-dim)">TARGET DATE:</span> ${row.visitDate} (Row #${rowIdx + 1})</p>
            <p id="topic-sync-line" style="font-size:0.8rem; margin: 5px 0; font-weight:bold">${topicStatus}</p>
            <hr style="margin: 15px 0; border: 0; border-top: 1px dashed var(--border)">
            <p style="color:var(--cyan); font-size: 0.8rem; margin-bottom: 5px">GENERATED JSON PAYLOAD:</p>
            <pre style="background:#000; border: 1px solid #333; padding:10px; color:#0f0; font-size: 0.75rem; overflow:auto">${JSON.stringify(payload, null, 2)}</pre>
        `;

        const statusEl = document.getElementById("topic-sync-line");
        if (finalTopicId !== null) {
            statusEl.style.color = "#0f0";
        } else if (topicStatus.includes("MISMATCH") || topicStatus.includes("ERROR")) {
            statusEl.style.color = "#f44";
        }
    };

    log(`Interrogating target: ${row.lesson_topic} (${row.visitDate})...`);
    updateStatus("EXTRACTING PAYLOAD DATA...");
    renderPayload();

    // Fix button always
    document.getElementById("save-mark").onclick = () => {
        log(`INJECTING MARK ID: ${els.modalMark.value}...`, "info");
        alert("INJECTION ATTEMPT LOGGED. Proxy required.");
    };

    try {
        const isoDate = formatDate(row.visitDate);
        // 1. Verification list ping
        await fetchJSON(`${BASE}/teacher/student-list?id_year=${ID_YEAR}&id_teacher=${row.id_teacher}&id_discipline=${row.id_discipline}&isSelect=${state.currentDiscipline.isSelect}&credit=${state.currentDiscipline.credit}&id_semester=${state.currentDiscipline.id_semester}&group=${state.id_group}&visitDate=${isoDate}&id_vid_zaniatiy=${row.id_vid_zaniatiy}&timesCount=1&subgroup=0&id_modul=1`, { method: 'POST' });
        
        // 2. Fetch Topics using new endpoint (POST method as requested)
        const topicsResponse = await fetchJSON(`${BASE}/lesson-topic/get-lessonTopic?discipline=${row.id_discipline}&id_teacher=${row.id_teacher}&id_vid_zaniatiy=${row.id_vid_zaniatiy}&id_modul=1`, { method: 'POST' });
        
        const journalCount = state.currentVid.journal.length;
        const topicCount = topicsResponse.length;

        if (journalCount === topicCount) {
            topicStatus = `[TOPIC MATCH: ${journalCount}/${topicCount}] - SYNCED BY INDEX`;
            finalTopicId = topicsResponse[rowIdx].id_lesson_topic;
        } else {
            topicStatus = `[TOPIC MISMATCH: ${journalCount} Lsns / ${topicCount} Topics] - ID OMITTED`;
            finalTopicId = null;
        }
        
        renderPayload();
        els.modalMark.onchange = renderPayload;

        document.getElementById("save-mark").onclick = async () => {
            const markId = els.modalMark.value;
            const isoDate = formatDate(row.visitDate);
            const matchingTopic = state.currentTopics ? (state.currentTopics.find(t => t.lesson_topic === row.lesson_topic) || state.currentTopics[0]) : null;

            const finalPayload = {
                "id_teacher": parseInt(row.id_teacher),
                "id_student": parseInt(state.id_student),
                "id_discipline": parseInt(row.id_discipline),
                "id_vid_zaniatiy": parseInt(row.id_vid_zaniatiy),
                "id_groupOrPorok": parseInt(state.id_group),
                "visitDate": `${isoDate}T00:00:00.000Z`,
                "timesCount": 1,
                "id_otsenka": parseInt(markId),
                "isVisited": true,           
                "credit": state.currentDiscipline.credit,
                "id_modul": 1,
                "isPotok": 0,
                "id_semesterOrWs": state.currentDiscipline.id_semester,
                "id_time": -1,
                "id_year": ID_YEAR,
                "subgroup": null,
                "typeGroup": 0,
                "attempt": 0
            };

            if (matchingTopic && journalCount === topicCount) {
                finalPayload["id_lesson_topic"] = matchingTopic.id_lesson_topic;
            }

            log(`ATTEMPTING INJECTION: Student ${state.id_student}, Mark ID ${markId}...`, "info");
            setSystemState('busy');

            try {
                const response = await fetch(`${BASE}/teacher/otsenka`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify(finalPayload)
                });

                const result = await response.json();
                
                if (response.ok) {
                    log(`SUCCESS: Injection completed! Server message: ${result.message || 'OK'}`, "ok");
                    setSystemState('ready');
                    alert(`SUCCESS!\nServer says: ${result.message || 'Data saved'}`);
                } else {
                    log(`FAILED: Status ${response.status}. Message: ${result.message || 'Unknown error'}`, "error");
                    setSystemState('ready');
                    alert(`FIELD INJECTION FAILED.\nStatus: ${response.status}\nMessage: ${result.message}`);
                }
            } catch (err) {
                log(`NETWORK ERROR: ${err.message}`, "error");
                setSystemState('ready');
                alert(`CONNECTION LOST: ${err.message}`);
            }
        };

    } catch (e) {
        log(`Interrogation Error: ${e.message}`, "error");
        topicStatus = `[TOPIC ERROR: FAILED TO FETCH TOPICS]`;
        renderPayload();
    }
}

// History Manager
function saveLogin(login) {
    if (!login) return;
    let history = JSON.parse(localStorage.getItem("avn_history") || "[]");
    history = [login, ...history.filter(h => h !== login)];
    localStorage.setItem("avn_history", JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem("avn_history") || "[]");
    const container = document.getElementById("history-items");
    const purgeBtn = document.getElementById("purge-history");

    if (history.length === 0) {
        els.history.classList.add("hidden");
        return;
    }

    container.innerHTML = history.map(item => `
        <div class="history-item" data-login="${item}">
            <span class="history-val">${item}</span>
            <span class="history-del" onclick="event.stopPropagation(); deleteHistory('${item}')">×</span>
        </div>
    `).join("");

    purgeBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm("PURGE ALL LOGIN HISTORY?")) {
            localStorage.removeItem("avn_history");
            renderHistory();
        }
    };
}

function deleteHistory(login) {
    let history = JSON.parse(localStorage.getItem("avn_history") || "[]");
    history = history.filter(h => h !== login);
    localStorage.setItem("avn_history", JSON.stringify(history));
    renderHistory();
}

function toggleStudentSearch(show) {
    const group = els.studentSearch.closest(".control-group");
    if (window.innerWidth <= 850) {
        if (show) {
            group.classList.remove("mobile-hidden");
        } else {
            group.classList.add("mobile-hidden");
        }
    } else {
        group.classList.remove("mobile-hidden");
    }
}

els.login.onfocus = () => {
    const history = JSON.parse(localStorage.getItem("avn_history") || "[]");
    if (history.length > 0) {
        renderHistory();
        els.history.classList.remove("hidden");
    }
    toggleStudentSearch(true);
};

// Document click to close history
document.addEventListener("click", (e) => {
    if (!els.login.contains(e.target) && !els.history.contains(e.target)) {
        els.history.classList.add("hidden");
    }
});

els.history.onclick = (e) => {
    const item = e.target.closest(".history-item");
    if (item && !e.target.classList.contains("history-del")) {
        const val = item.querySelector(".history-val").textContent;
        els.login.value = val;
        els.history.classList.add("hidden");
        startInjection(); // AUTO-INJECT on selection
    }
};

window.deleteHistory = deleteHistory;
renderHistory();
loadStudentsData();
toggleStudentSearch(true);
setSystemState('waiting');
