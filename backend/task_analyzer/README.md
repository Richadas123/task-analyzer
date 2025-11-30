Smart Task Analyzer
A full-stack web application for analyzing and prioritizing tasks using urgency, importance, effort, and dependency structures.
Includes cycle detection, graph visualization, detailed score explanations, and multiple scoring strategies.

---

Setup Instructions
This project consists of a Django backend (REST API) and a JavaScript/HTML frontend.

---

1. Backend Setup (Django)
   Step 1 — Create a virtual environment
   python -m venv venv
   Step 2 — Activate environment
   Windows
   venv\Scripts\activate
   macOS/Linux
   source venv/bin/activate
   Step 3 — Install backend dependencies
   pip install -r backend/requirements.txt
   Step 4 — Run database migrations
   cd backend
   python manage.py migrate
   Step 5 — Run unit tests
   python manage.py test
   Step 6 — Start backend server
   python manage.py runserver
   The API is now available at:
   http://127.0.0.1:8000/api/tasks/

---

2. Frontend Setup
   No build steps required.
   Simply open:
   frontend/index.html
   in any browser.
   If needed, the backend URL can be updated by editing:
   const apiBase = "http://127.0.0.1:8000/api";

---

Algorithm Explanation (≈400–500 words)
The Smart Task Analyzer evaluates each task using four major components: urgency, importance, effort, and dependency structure. These components are combined into a weighted priority score that adapts depending on the selected strategy mode.

---

1. Urgency (Based on Due Date)
   Urgency is derived from how close the due date is to the current date. Tasks closer to the deadline receive higher urgency, while tasks without due dates default to low urgency.
   The rules are:
   -> Overdue tasks: receive the highest urgency because they represent an immediate risk of failure.
   -> Due within 3 days: urgency ~9/10
   -> Due within 7 days: urgency ~7/10
   -> Due within 30 days: urgency ~5/10
   -> Beyond 30 days or no due date: urgency ~2/10
   This scaling ensures the system highlights immediate deadlines while still providing meaningful values for tasks with future dates.

---

2. Importance (User Input: 1–10)
   Importance reflects subjective human judgment. Instead of predicting importance, the system directly incorporates the number provided by the user.
   Importance has strong base weight because:
   -> It reflects long-term impact
   -> It is often stable and not tied to dates
   -> It should not be overridden merely by short deadlines
   In “High Impact Mode,” importance becomes the dominant factor in scoring.

---

3. Effort (Estimated Hours)
   Effort affects score inversely:
   -> Small tasks (low hours) get a slight bonus
   -> Large tasks get a slight penalty
   Effort exists to surface “quick wins” that can be completed early without disrupting larger priorities.
   In “Fastest Wins Mode,” this factor becomes heavily weighted to emphasize rapid progress.

---

4. Dependency Structure (How Many Tasks Depend on Each Task)
   The system analyzes the dependency graph created from the user’s input:
   -> Tasks with many dependents receive a priority boost
   -> They unlock more of the workflow
   -> Finishing them early prevents bottlenecks
   The app performs full dependency resolution:
   -> Dependencies can be specified by ID or title
   -> The system normalizes both
   -> Circular dependencies are detected using DFS
   -> If a cycle exists, the backend returns a flagged response
   -> Frontend highlights cycle nodes and disables the Eisenhower Matrix
   This ensures users cannot accidentally create impossible workflows.

---

5. Final Score Calculation
   The formula (conceptually):
   priority =
   w1 _ urgency +
   w2 _ importance +
   w3 _ dependency_influence +
   w4 _ quick_win_bonus -
   w5 \* effort_penalty
   The weights change dynamically depending on which scoring strategy is selected:
   -> Smart Balance: evenly weights all factors
   -> High Impact: increases w2
   -> Deadline Driven: increases w1
   -> Fastest Wins: increases w4 and w5
   Each task returns a full explanation object so users know exactly why the score was assigned.

---

Design Decisions
Why a simple scoring algorithm?
A deterministic (non-ML) approach gives:
• Transparency — users can see why a priority was assigned
• Predictability — no hidden behavior
• Speed — fully local scoring
• Ease of debugging
Frontend-first flow
The assignment allowed flexibility, so tasks are stored in-memory on the frontend for rapid iteration. Backend remains stateless and only performs analysis.
Graph structure
The backend returns a normalized graph {nodes, edges} so the frontend can use D3.js without any additional transformation.
Cycle detection
Preventing impossible workflows is critical, so cycle detection was implemented early and integrated tightly with the UI.
Eisenhower Matrix
Included to visually categorize tasks by urgency and importance. If cycles exist, it is disabled to prevent invalid interpretations.

---

Time Breakdown
Feature / Task Time Spent
Research + planning 20–30 min
Designing scoring algorithm 45–60 min
Django backend setup + models + views 45 min
Dependency resolution + cycle detection 20–30 min
Unit tests for scoring 20 min
Frontend UI (HTML/CSS) 30 min
JavaScript logic + API integration 45–60 min
D3.js graph visualization 30–40 min
Eisenhower Matrix 20–30 min
Debugging + cleanup 20 min
README + documentation 20–30 min
Total: ~4 to 4.5 hours

---

Bonus Challenges Attempted

1. Graph visualization using D3.js
2. Automatic dependency resolution (ID or title)
3. Circular dependency detection
4. Eisenhower Matrix visualization
5. Multiple scoring strategies
6. Task explanations returned from backend
7. Unit tests for scoring logic

---

Future Improvements
• Add user-configurable weight sliders
• Option to save tasks using localStorage or backend persistence
• Visual timeline / Gantt chart
• Drag-and-drop task ordering
• Machine learning to refine weights based on user behavior
• Bulk task import/export
