# Smart Task Analyzer

A full-stack web application for analyzing and prioritizing tasks using urgency, importance, effort, and dependency structures.  
Includes cycle detection, graph visualization, detailed score explanations, and multiple scoring strategies.

---

## Setup Instructions

This project contains a **Django backend (REST API)** and a **JavaScript/HTML frontend**.

---

## 1. Backend Setup (Django)

### Step 1 — Create a virtual environment

```
python -m venv venv
```

### Step 2 — Activate environment

**Windows:**

```
venv\Scripts\activate
```

**macOS/Linux:**

```
source venv/bin/activate
```

### Step 3 — Install dependencies

```
pip install -r backend/requirements.txt
```

### Step 4 — Run database migrations

```
cd backend
python manage.py migrate
```

### Step 5 — Run unit tests

```
python manage.py test
```

### Step 6 — Start backend server

```
python manage.py runserver
```

The API is now available at:  
**http://127.0.0.1:8000/api/tasks/**  
_(Note: Localhost URLs will only work when the backend server is running locally.)_

---

## 2. Frontend Setup

No build steps required.

Simply open:

```
frontend/index.html
```

in any browser.

To change the backend URL, update this line in `script.js`:

```js
const apiBase = "http://127.0.0.1:8000/api";
```

---

# Algorithm Explanation (≈400–500 words)

The Smart Task Analyzer evaluates each task using four major components: urgency, importance, effort, and dependency structure. These components combine into a weighted priority score that adapts based on the selected strategy.

---

## 1. Urgency (Based on Due Date)

Urgency is derived from how close the task is to its due date.  
Rules:

- Overdue tasks → **Highest urgency**
- Due in ≤3 days → urgency ≈ 9/10
- Due in ≤7 days → urgency ≈ 7/10
- Due in ≤30 days → urgency ≈ 5/10
- Beyond 30 days or missing date → urgency ≈ 2/10

This ensures immediate deadlines are highlighted without ignoring future tasks.

---

## 2. Importance (User Input: 1–10)

Importance reflects the user's own judgment.  
It has a strong base weight because:

- It represents long-term impact
- It is stable over time
- It should not be overruled by temporary urgency

In **High Impact Mode**, importance dominates the score.

---

## 3. Effort (Estimated Hours)

Effort affects score **inversely**:

- Small tasks (low hours) → **bonus** for quick wins
- Large tasks → slight penalty

In **Fastest Wins Mode**, effort becomes heavily weighted to emphasize rapid progress.

---

## 4. Dependency Structure

The backend constructs a dependency graph:

- Tasks that many other tasks depend on → **higher priority**
- These tasks unlock more workflow
- Helps avoid bottlenecks

Process:

- Dependencies can be IDs or titles
- System normalizes both
- Cycles detected using DFS
- If a cycle exists → backend flags it
- Frontend highlights cycle nodes and disables Eisenhower Matrix

This prevents users from creating impossible workflows.

---

## 5. Final Score Formula

### Conceptual Formula

```
priority =
  w1 * urgency +
  w2 * importance +
  w3 * dependency_influence +
  w4 * quick_win_bonus -
  w5 * effort_penalty
```

Weight adjustments by strategy:

- **Smart Balance** → evenly weights all
- **High Impact** → increases w2
- **Deadline Driven** → increases w1
- **Fastest Wins** → increases w4 and w5

Each task returns a full explanation object so users understand how the score was generated.

---

# Design Decisions

### Why a simple deterministic algorithm?

- Transparent
- Predictable
- Fast
- Easy to debug

### Frontend-first flow

Tasks are stored in-memory for speed; backend stays stateless and focused on analysis.

### Graph structure

Backend returns `{nodes, edges}` so D3.js can render instantly.

### Cycle detection

Implemented early to prevent invalid workflow states.

### Eisenhower Matrix

Helps visualize urgency vs importance; disabled if cycles are detected.

---

# Time Breakdown

| Feature / Task        | Time Spent      |
| --------------------- | --------------- |
| Planning & Research   | 20–30 min       |
| Scoring Algorithm     | 45–60 min       |
| Django Backend        | 45 min          |
| Dependency Resolution | 20–30 min       |
| Unit Tests            | 20 min          |
| Frontend UI           | 30 min          |
| JS API Integration    | 45–60 min       |
| D3.js Graph           | 30–40 min       |
| Eisenhower Matrix     | 20–30 min       |
| Debugging             | 20 min          |
| Documentation         | 20–30 min       |
| **Total**             | **4–4.5 hours** |

---

# Bonus Challenges Completed

1. Dependency graph visualization (D3.js)
2. Automatic dependency resolution (ID or title)
3. Circular dependency detection
4. Eisenhower Matrix
5. Multiple scoring strategies
6. Full explanation object per task
7. Unit tests for scoring logic

---

# Future Improvements

- Sliders for custom weight configuration
- Save tasks to localStorage or database
- Gantt chart timeline
- Drag-and-drop task ordering
- ML-based weight refinement
- Import/export tasks

---

## Project Structure

```
task-analyzer/
│── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── task_analyzer/
│   └── tasks/
│
│── frontend/
│   ├── index.html
│   ├── styles.css
│   └── script.js
│
└── README.md
```
