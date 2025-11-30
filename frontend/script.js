
// Local storage for tasks before sending to API
const tasksLocal = [];

// Base URL for API endpoints
const apiBase = "http://127.0.0.1:8000/api/tasks";

// Tracks whether a circular dependency was detected
let globalHasCycle = false;

function el(id) { return document.getElementById(id); }


//  Fetch JSON safely, returns object with {ok, status, data, text}.
//  Handles network errors and invalid JSON.
 
async function safeFetchJson(url, options) {
  try {
    const resp = await fetch(url, options);
    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { ok: resp.ok, status: resp.status, data, text };
  } catch (err) {
    return { ok: false, status: 0, data: null, text: err.message };
  }
}


// Handle "Add Task" form submission.
// Creates a new task object, stores it in the local task array,
// and then clears all input fields for convenience.

el("task-form").addEventListener("submit", (e) => {
  e.preventDefault();

  // Generate a simple unique ID based on timestamp
  const id = String(Date.now());

  // Read basic fields from the form
  const title = el("title").value.trim();
  const due_date = el("due_date").value || null;
  const estimated_hours = parseFloat(el("estimated_hours").value || 0);
  const importance = parseInt(el("importance").value || 5);

  // Parse comma-separated dependency input into a clean array
  const dependencies = el("dependencies").value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Store new task in the local list
  tasksLocal.push({
    id,
    title,
    due_date,
    estimated_hours,
    importance,
    dependencies,
  });


  // Reset form fields for next entry
  el("title").value = "";
  el("due_date").value = "";
  el("estimated_hours").value = "";
  el("dependencies").value = "";

  showMessage("Task added locally.");
});

// Update the UI message area with a status message.
// Passing an empty string clears the displayed message.
function showMessage(msg) {
  el("message").textContent = msg || "";
}

// Toggle the loading state for analyze/suggest buttons,
// and optionally display a "Loading…" status message.
function setLoading(state) {
  el("analyze-btn").disabled = state;
  el("suggest-btn").disabled = state;
  if (state) showMessage("Loading…");
}


// Resolve dependencies by ID or title.
// Converts all dependency references into valid task IDs whenever possible.
// This allows users to enter dependencies using either:
//   - the exact task ID, or
//   - the task title (which gets mapped back to its corresponding ID).
 
function resolveDependencyIds(tasks) {

  // Make a shallow copy of tasks with normalized string IDs
  // and cloned dependency arrays to avoid mutating original data.
  const copy = tasks.map((t) => ({
    ...t,
    id: String(t.id),
    dependencies: [...(t.dependencies || [])],
  }));

  // Lookup tables to quickly resolve dependencies
  const byId = new Map(copy.map((t) => [t.id, t]));          // ID -> task
  const byTitle = new Map(copy.map((t) => [t.title, t]));    // Title -> task

  // Rebuild each task with dependencies converted into real task IDs
  return copy.map((t) => {
    const deps = t.dependencies.map((depRaw) => {
      const dep = String(depRaw);

      // Case 1: dependency already matches an ID
      if (byId.has(dep)) return dep;

      // Case 2: dependency matches a task title → replace with its ID
      const match = byTitle.get(dep);
      return match ? match.id : dep;        // leave unmatched dependencies unchanged
    });
    return { ...t, dependencies: deps };
  });
}

// Build graph nodes and edges from resolved tasks for visualization.
// Each task becomes a node; each dependency becomes a directed edge.
// The resulting structure is compatible with D3 and other graph renderers.

function buildGraphFromTasks(tasksResolved) {

  // Convert each task into a normalized node with string ID
  const nodes = tasksResolved.map((t) => ({
    id: String(t.id),
    title: t.title,
  }));

  // Keep a set of valid node IDs to validate dependency edges later
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Build edges: for each task, for each dependency → create source → target link
  const edges = tasksResolved
    .flatMap((t) =>
      (t.dependencies || []).map((dep) => ({

        // Dependency points TO the task that depends on it
        source: String(dep),
        target: String(t.id),
      }))
  )
    
    // Filter out edges referencing nodes that don't exist (bad or missing IDs)
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Return normalized graph structure
  return { nodes, edges };
}

// Normalize raw graph data from API into a consistent { nodes, edges } format.
// This function handles differently shaped API responses by mapping them
// into a unified structure usable by D3 or other visualization code.

function normalizeGraph(raw) {

  // If no data provided, return an empty graph
  if (!raw) return { nodes: [], edges: [] };

  // Accept flexible naming for node collections from various backends
  const rawNodes = raw.nodes || raw.vertices || raw.items || [];

  // Accept flexible naming for edge collections as well
  const rawEdges =
    raw.edges ||
    raw.links ||
    raw.relations ||
    raw.connections ||
    raw.arcs ||
    [];

  
  // Normalize all node objects to a standard structure
  const nodes = rawNodes.map((n) => ({

    // Always cast IDs to strings for consistency in D3 keys
    id: String(n.id),

    // Use title/name if available; fall back to ID
    title: n.title || n.name || String(n.id),

    // Mark if the node is part of a detected cycle
    isCycle: n.isCycle || false,
  }));

  // Normalize edges to standard {source, target} shape
  const edges = rawEdges.map((e) => ({

    // Attempt to read source from multiple possible field names
    source: String(
      e.source ||
        e.from ||
        e.u ||
        e.parent ||
        e.src ||
        e.start ||
        ""
    ),

    // Attempt to read target from multiple possible field names
    target: String(
      e.target ||
        e.to ||
        e.v ||
        e.child ||
        e.dst ||
        e.end ||
        ""
    ),
  }));

  // Return fully normalized graph
  return { nodes, edges };
}


// Collects tasks to send to the backend.
// Priority: 1) User JSON input  2) Tasks stored locally in the UI.

function getTasksToSend() {

  // Read raw text from JSON input box
  const txt = (el("json-input")?.value || "").trim();

  // If user provided custom JSON, parse and validate it
  if (txt) {
    try {
      const arr = JSON.parse(txt);

      // Input must be an array of task objects
      if (!Array.isArray(arr)) {
        showMessage("JSON must be an array.");
        return [];
      }

      // Normalize each task by ensuring required fields exist.
      return arr.map((t) => ({

        // Generate an ID if missing (ensures backend consistency)
        id: t.id ?? String(Date.now() + Math.random() * 1000),

        // Use default title if user omitted it
        title: t.title ?? "Untitled",

        due_date: t.due_date ?? null,

        // Default effort to zero hours
        estimated_hours: t.estimated_hours ?? 0,

        importance: t.importance ?? 5,

        // Default to empty dependency list
        dependencies: t.dependencies ?? [],
      }));
    } catch (e) {

       // JSON parsing error — notify user and return empty list
      showMessage("Invalid JSON: " + e.message);
      return [];
    }
  }

  // If no custom JSON was supplied, fall back to UI-created tasks
  // Ensuring IDs are converted to strings for backend compatibility.
  return tasksLocal.map((t) => ({ ...t, id: String(t.id) }));
}


// Clear Eisenhower matrix quadrants or show error if cycles detected.

function blockMatrix() {

  // Remove all quadrant content
  ["q1", "q2", "q3", "q4"].forEach((id) => {
    const box = el(id);
    if (box) box.innerHTML = "";
  });


  // Replace matrix view with an error message
  const tab = el("matrix-tab");
  tab.innerHTML = "";
  const msg = document.createElement("div");
  msg.style.color = "#b91c1c";
  msg.style.fontSize = "16px";
  msg.style.padding = "40px";
  msg.style.textAlign = "center";
  msg.textContent =
    "Cannot render matrix: Circular dependencies detected";
  tab.appendChild(msg);
}

// Handle Analyze button click
el("analyze-btn").addEventListener("click", async () => {
  const tasksToSend = getTasksToSend();
  if (!tasksToSend.length) return showMessage("No tasks to analyze.");

  // Selected scoring strategy (smart, urgency-focused, effort-focused, etc.)
  const strategy = el("strategy")?.value || null;

  setLoading(true);

  try {

    // Send tasks to backend /analyze/ endpoint
    const { ok, data, text } = await safeFetchJson(
      `${apiBase}/analyze/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: tasksToSend, strategy }),
      }
    );

    // If backend returned an error (cycles or validation issue)
    if (!ok) {

      // Special handling: highlight circular dependencies
      if (data?.cycles) {
        globalHasCycle = true;

        // Determine tasks for graph rendering
        const allTasksRaw = tasksLocal.length
          ? tasksLocal
          : tasksToSend;
        const resolved = resolveDependencyIds(allTasksRaw);

        // Collect cycle node IDs for highlighting
        const cycleSet = new Set(
          (data.cycles || []).flat().map(String)
        );

        // Build dependency graph with cycle nodes marked
        const graph = buildGraphFromTasks(resolved);
        graph.nodes = graph.nodes.map((n) => ({
          ...n,
          isCycle: cycleSet.has(n.id),
        }));

        // Save graph to global state so the Graph tab can re-render
        window._lastGraphData = {
          tasks: resolved,
          cycles: data.cycles,
          graph,
        };

        // Show graph and block matrix view
        renderGraphD3(graph, data.cycles, resolved);
        blockMatrix();

        return showMessage(
          "Circular dependencies detected. Please fix them."
        );
      }

      return showMessage(
        data?.detail || `Error analyzing tasks: ${text}`
      );
    }

    analyzeFinished(data);
  } catch (e) {

    // Network/connection issues
    showMessage("Network error: " + e);
  } finally {
    setLoading(false);
  }
});

// Handle Suggest button click

el("suggest-btn").addEventListener("click", async () => {
  const tasksToSend = getTasksToSend();
  if (!tasksToSend.length) return showMessage("No tasks to analyze.");

  const strategy = el("strategy")?.value || null;

  setLoading(true);

  try {
    // Request backend suggestions
    const { ok, data, text } = await safeFetchJson(
      `${apiBase}/suggest/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: tasksToSend, strategy }),
      }
    );

    if (!ok)
      return showMessage(
        data?.detail || `Error fetching suggestions: ${text}`
      );

    // Convert backend suggestion structure into frontend-friendly objects
    const suggestions = (data.suggestions || []).map((s) => ({
      id: s.task.id,
      title: s.task.title,
      meta: s.task.explanation,
      score: s.task.score,
      why: Array.isArray(s.why)
        ? s.why.join(", ")
        : s.why,
      _isSuggestion: true,
      importance: s.task.importance,
      due_date: s.task.due_date,
      estimated_hours: s.task.estimated_hours,
    }));

    // Show suggestions in results list
    renderResults(suggestions);

    // Update matrix only if no cycles exist
    if (!globalHasCycle) renderMatrix(suggestions);
    else blockMatrix();

    showMessage("");
  } catch (e) {
    showMessage("Network error: " + e);
  } finally {
    setLoading(false);
  }
});


// Render task results into the results panel.
// Each task is displayed with a title, optional explanation, and priority badge.

function renderResults(list) {
  const box = el("results");
  if (!box) return;

  // Clear any previous results
  box.innerHTML = "";
  (list || []).forEach(t => {

    // Create row container with styling based on score
    const row = document.createElement("div");
    row.className = "task " + (typeof t.score === 'number' ? priorityClass(t.score) : "medium");

    // Left side: title + explanation/meta text
    const left = document.createElement("div");
    left.innerHTML = `<strong>${t.title}</strong><div class="meta">${t.meta || t.explanation || ""}</div>`;

    // If this is a suggestion result, show the "why" reasoning
    if (t._isSuggestion && t.why) {
      const why = document.createElement("div");
      why.textContent = "Why: " + t.why;
      left.appendChild(why);
    }


    // Badge showing task score (if available)
    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = (t.score !== undefined) ? ("Score " + t.score) : "";

    row.appendChild(left);
    row.appendChild(badge);

    // Add row to results container
    box.appendChild(row);
  });
}


// Decide CSS class based on score thresholds.
// Used to color-code high/medium/low priority tasks.
function priorityClass(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}


// Compute urgency score based on due date

function computeUrgencyScore(due_date_str) {

  // If there is no due date, we treat it as not urgent
  if (!due_date_str) return 0;

  try {

    // Normalize current date to midnight (avoid time-of-day issues)
    const today = new Date();
    today.setHours(0, 0, 0, 0);


    // Parse and normalize the due date
    const due = new Date(due_date_str);
    due.setHours(0, 0, 0, 0);


    // Calculate difference in full days between today and due date
    const diff = Math.ceil(
      (due - today) / (1000 * 60 * 60 * 24)
    );


    // If overdue: increase urgency based on how many days late
    // Maximum extra urgency added is capped to avoid extreme values

    if (diff < 0)
      return 7 + Math.min(Math.abs(diff) / 3, 3);


    // Tasks due in 3 days or less → very urgent
    if (diff <= 3) return 9;

    // Due within a week → moderately urgent
    if (diff <= 7) return 7;

    // Due within a month → somewhat urgent
    if (diff <= 30) return 5;

    // Distant deadline → low urgency
    return 2;
  } catch {

    // In case of invalid date formats or parsing errors,
    // default to 0 urgency instead of crashing
    return 0;
  }
}


// Render tasks in Eisenhower matrix based on urgency and importance.

function renderMatrix(tasks) {

  // Clear existing content in all quadrants
  ["q1","q2","q3","q4"].forEach(id => { const eln = el(id); if(eln) eln.innerHTML = ""; });
  const all = tasks || [];

  // If no tasks, display placeholder in each quadrant
  if (!all.length) {
    ["q1","q2","q3","q4"].forEach(id => {
      const container = el(id);
      if (container) container.innerHTML = "<div style='color:#6b7280;font-size:14px'>No tasks</div>";
    });
    return;
  }

  // Determine importance and urgency
  all.forEach(t => {
    const importance = Number(t.importance ?? t.task?.importance ?? 5);
    const due_date = t.due_date ?? t.task?.due_date ?? null;
    const urgency = computeUrgencyScore(due_date);
    const isImportant = importance >= 6;
    const isUrgent = urgency >= 6 || (typeof t.score === 'number' && t.score >= 70);


    // Assign quadrant based on importance & urgency
    let qId = "q4";      // default: Not urgent & Not important
    if (isImportant && isUrgent) qId = "q1";      // Do First
    else if (isImportant && !isUrgent) qId = "q2";      // Schedule
    else if (!isImportant && isUrgent) qId = "q3";     // Delegate


    // Create task card
    const card = document.createElement("div");
    card.className = "task";


    // Title and meta information
    const title = `<strong>${t.title ?? t.task?.title ?? "Untitled"}</strong>`;
    const metaParts = [];
    if (due_date) metaParts.push(`Due: ${due_date}`);
    if (t.estimated_hours !== undefined) metaParts.push(`Est: ${t.estimated_hours}h`);
    if (importance) metaParts.push(`Imp: ${importance}/10`);
    if (t.score !== undefined) metaParts.push(`Score: ${t.score}`);
    const meta = `<small style="color:#374151">${metaParts.join(" • ")}</small>`;
    const left = document.createElement("div");
    left.innerHTML = `${title}<br>${meta}`;
    const right = document.createElement("div");
    right.style.whiteSpace = "nowrap";
    right.innerHTML = `<span class="badge">${Math.round(urgency)}/10</span>`;


    // Append left and right sections to the card
    card.appendChild(left);
    card.appendChild(right);


    // Append card to appropriate quadrant
    const container = el(qId);
    if (container) container.appendChild(card);
  });
}


// Render dependency graph using D3.
// Highlights nodes involved in circular dependencies in red.
// Supports dragging and zooming.

function renderGraphD3(graph, cycles, tasksArr) {
  const svg = d3.select("#graph-canvas");
  svg.selectAll("*").remove();       // Clear any existing graph

  const bbox = svg.node().getBoundingClientRect();
  const width = bbox.width || 800;
  const height = bbox.height || 400;


  // Wrapper group for zooming/panning
  const wrapper = svg
    .append("g")
    .attr("class", "wrapper");

  
  // Enable zoom & pan
  svg.call(
    d3.zoom().scaleExtent([0.4, 2]).on("zoom", (e) => {
      wrapper.attr("transform", e.transform);
    })
  );


  // Prepare cycle set for highlighting nodes in red
  const cycleSet = new Set((cycles || []).flat().map(String));

  // Map task IDs to titles for labeling nodes
  const idToTitle = new Map(
    (tasksArr || []).map((t) => [String(t.id), t.title])
  );


  // Create node objects, marking cycles
  const nodes = graph.nodes.map((n) => ({
    id: String(n.id),
    isCycle: cycleSet.has(String(n.id)),
    title: idToTitle.get(String(n.id)) || n.title,
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Prepare edges, filtering out invalid references
  const links = graph.edges
    .map((e) => ({
      source: String(e.source),
      target: String(e.target),
    }))
    .filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

  
  // Setup D3 force simulation
  const sim = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3.forceLink(links).id((d) => d.id).distance(100)
    )
    .force("charge", d3.forceManyBody().strength(-240))
    .force(
      "center",
      d3.forceCenter(width / 2, height / 2)
    )
    .force("collide", d3.forceCollide(30));

  
  // Draw links
  const link = wrapper
    .append("g")
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", "#555")
    .attr("stroke-width", 2);

  
  // Draw nodes (circles), color red if part of a cycle
  const node = wrapper
    .append("g")
    .selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", 20)
    .attr("fill", (d) => (d.isCycle ? "red" : "#4caf50"))
    .call(
      d3
        .drag()
        .on("start", dragStart)
        .on("drag", dragged)
        .on("end", dragEnd)
    );

  
  // Add labels next to nodes
  const label = wrapper
    .append("g")
    .selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .text((d) => d.title)
    .attr("dx", 25)
    .attr("dy", 5)
    .attr("font-size", 13);

  
  // Update positions on each simulation tick
  sim.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y);

    label
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y);
  });


  // Drag event handlers
  function dragStart(e) {
    if (!e.active) sim.alphaTarget(0.3).restart();     // Activate simulation
    e.subject.fx = e.subject.x;
    e.subject.fy = e.subject.y;
  }
  function dragged(e) {
    e.subject.fx = e.x;
    e.subject.fy = e.y;
  }
  function dragEnd(e) {
    if (!e.active) sim.alphaTarget(0);     // Stop simulation alpha
    e.subject.fx = null;
    e.subject.fy = null;
  }
}



// Adding click event listeners to all tab buttons

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {

    // Remove "active" class from all tabs and all tab contents
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.remove("active"));

    
    // Activate the clicked tab and its corresponding content
    btn.classList.add("active");
    el(btn.dataset.tab).classList.add("active");


    // If "Dependency Graph" tab is selected, render the D3 graph
    if (btn.dataset.tab === "graph-tab") {
      if (window._lastGraphData)
        renderGraphD3(
          window._lastGraphData.graph,
          window._lastGraphData.cycles,
          window._lastGraphData.tasks
        );
    }


    // If "Eisenhower Matrix" tab is selected, render the matrix
    if (btn.dataset.tab === "matrix-tab") {
      if (globalHasCycle) blockMatrix();
      else if (window._lastGraphData)
        renderMatrix(window._lastGraphData.tasks);      // Render from last analyzed tasks
      else renderMatrix(tasksLocal);      // Fallback: render local tasks
    }
  });
});


// Handles the completion of the "analyze" API call.
// Updates the UI with task results, dependency graph, and Eisenhower matrix.

function analyzeFinished(data) {

  // Clear any previous message and reset cycle flag
  showMessage("");
  globalHasCycle = false;

  // Render the task list with scores
  renderResults(data.tasks || []);

  let graph;

  // Use API-provided graph if available, else build graph from tasks
  if (data.graph) {
    graph = normalizeGraph(data.graph);
  } else {
    const resolved = resolveDependencyIds(data.tasks || []);
    graph = buildGraphFromTasks(resolved);
  }

  // Store last graph data globally for tab switching and re-rendering
  window._lastGraphData = {
    graph,
    tasks: data.tasks,
    cycles: data.cycles || [],
  };

  // Render the dependency graph using D3
  renderGraphD3(graph, data.cycles || [], data.tasks);

  // Render the Eisenhower matrix if no circular dependencies detected
  if (!data.cycles || data.cycles.length === 0)
    renderMatrix(data.tasks);
  else blockMatrix();         // Show error / clear matrix if cycles exist
}


