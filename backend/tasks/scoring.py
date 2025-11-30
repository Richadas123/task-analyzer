
# Task scoring module for Smart Task Analyzer.

# Calculates priority scores for tasks based on:
# - Urgency (time until due date)
# - Importance (user-defined rating)
# - Effort (estimated hours)
# - Dependency (tasks that block other tasks)

# Supports multiple weighting strategies: 'smart', 'fastest', 'impact', 'deadline'.


from typing import List, Dict, Tuple
import math
from datetime import date, datetime, timedelta

# Default weights for task scoring factors

DEFAULT_WEIGHTS = {
    'urgency': 0.4,
    'importance': 0.35,
    'effort': 0.15,   
    'dependency': 0.10,
}

# Maximum number of days for urgency normalization
MAX_URGENCY_DAYS = 30  

# Returns number of days from today until the task's due date.
# Returns None if due_date is not provided.

def days_until_due(due_date):
    if due_date is None:
        return None
    today = date.today()
    return (due_date - today).days


# Detect circular dependencies among tasks using DFS(Depth First Search).
# Returns a list of cycles, each represented as a list of task IDs.

def detect_cycles(tasks):
    
    id_map = { str(t["id"]): True for t in tasks }

    graph = { str(t["id"]): [] for t in tasks }

    for t in tasks:
        tid = str(t["id"])
        deps = t.get("dependencies", []) or []

        for dep in deps:
            dep_id = str(dep).strip()
            
            if dep_id and dep_id in id_map:
                graph[tid].append(dep_id)

    visited = set()
    stack = set()
    cycles = []

    def dfs(node, path):
        if node in stack:
            idx = path.index(node)  
            cycles.append(path[idx:])
            return

        if node in visited:
            return

        visited.add(node)
        stack.add(node)

        for nbr in graph[node]:
            dfs(nbr, path + [nbr])

        stack.remove(node)

    
    for node in graph:
        if node not in visited:
            dfs(node, [node])

    return cycles


# Predefined holidays for urgency calculations (only year 2025 included for simplicity)
HOLIDAYS = {
    date(2025, 1, 1),   # New Year's Day
    date(2025, 12, 25),  # Christmas
    date(2025, 8, 15),   # Independence Day
}

# Calculate the number of business days (excluding weekends and holidays) between two dates. 
# Returns negative if start > end.

def business_days_between(start: date, end: date) -> int:
    
    if start is None or end is None:
        return None
    if start > end:
        return -(business_days_between(end, start))

    delta = 0
    current = start
    while current < end:
        if current.weekday() < 5 and current not in HOLIDAYS:
            delta += 1
        current += timedelta(days=1)
    return delta


# Compute priority scores for a list of tasks.
# Factors considered: urgency, importance, effort, dependency.
# Supports multiple strategies to adjust weighting.
# Returns tasks sorted by descending score with explanations.

def compute_scores(tasks: List[Dict], weights: Dict = None, strategy: str = 'smart') -> List[Dict]:
    
    if weights is None:
        weights = DEFAULT_WEIGHTS.copy()
    else:
        
        w = DEFAULT_WEIGHTS.copy()
        w.update(weights)
        weights = w

    # Adjust weights based on selected strategy
    if strategy == 'fastest':
        weights['effort'] = max(weights.get('effort', 0), 0.5)
        weights['urgency'] *= 0.5
        weights['importance'] *= 0.5
    elif strategy == 'impact':
        weights['importance'] = max(weights.get('importance', 0), 0.6)
        weights['effort'] *= 0.4
    elif strategy == 'deadline':
        weights['urgency'] = max(weights.get('urgency', 0), 0.7)
        weights['importance'] *= 0.6


    # Map task IDs (or titles if ID is missing) to task objects

    id_of = {}
    for t in tasks:
        key = str(t.get('id') or t.get('title'))
        id_of[key] = t

    # Count how many other tasks depend on each task
    depended_count = {k: 0 for k in id_of}
    for t in tasks:
        for dep in t.get('dependencies', []) or []:
            dep_key = str(dep)
            if dep_key in depended_count:
                depended_count[dep_key] += 1

    scored = []
    for t in tasks:
        key = str(t.get('id') or t.get('title'))
        title = t.get('title', key)
        due = t.get('due_date')  
        if isinstance(due, str):
            try:
                due = datetime.fromisoformat(due).date()
            except Exception:
                due = None

        days = days_until_due(due) if due else None
        importance = float(t.get('importance', 5) or 5)  

        # Normalize importance to [0,1]

        importance_norm = (importance - 1) / 9.0  
        est = float(t.get('estimated_hours', 0) or 0)
        
        # Effort normalization: lower estimated hours give higher score.
        # Uses logarithmic scaling to reduce impact of very high effort tasks.
        effort_norm = 1.0 / (1.0 + math.log1p(est + 1))  

        

        if due is None:
            urgency_norm = 0.0
            days = None
        else:
            today = date.today()
            
            bd = business_days_between(today, due)

            days = (due - today).days  

            if bd is None:
                urgency_norm = 0.0
            else:
                if bd < 0:
                    urgency_norm = 1.0 + min(abs(bd) / 5.0, 2.0)
                else:
                    capped = min(bd, MAX_URGENCY_DAYS)
                    urgency_norm = 1.0 - (capped / MAX_URGENCY_DAYS)


        # Dependency score: higher if more tasks depend on this task
        dep_score = min(depended_count.get(key, 0) / max(1, len(tasks)), 1.0)  

        # Weighted sum of normalized factors
        score = (
            weights.get('urgency', 0) * urgency_norm +
            weights.get('importance', 0) * importance_norm +
            weights.get('effort', 0) * effort_norm +
            weights.get('dependency', 0) * dep_score
        )

        score_scaled = round(score * 100, 2)

        # Explanation for UI: shows contribution of each factor
        explanation_parts = []
        explanation_parts.append(f"urgency={round(urgency_norm,3)} (days_until_due={days})")
        explanation_parts.append(f"importance={round(importance_norm,3)}")
        explanation_parts.append(f"effort={round(effort_norm,3)} (est_hours={est})")
        explanation_parts.append(f"dependency={round(dep_score,3)} (depended_by={depended_count.get(key,0)})")

        explanation = "; ".join(explanation_parts)

        scored.append({
            **t,
            'id': key,
            'score': score_scaled,
            'raw_score': score,
            'explanation': explanation,
            '_meta': {
                'urgency_norm': urgency_norm,
                'importance_norm': importance_norm,
                'effort_norm': effort_norm,
                'dependency_norm': dep_score,
            }
        })

    # Sort tasks by raw score in descending order
    scored_sorted = sorted(scored, key=lambda x: x['raw_score'], reverse=True)
    return scored_sorted

