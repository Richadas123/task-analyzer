
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .serializers import TaskSerializer
from .scoring import compute_scores, detect_cycles
from datetime import datetime
import copy



class AnalyzeTasksAPIView(APIView):

    # API endpoint to analyze tasks and compute their priority scores.
    # Returns scored tasks, detected cycles, and dependency graph.

    def post(self, request):
        payload = request.data

        # Determine payload format (list of tasks or dict with 'tasks', 'weights', 'strategy')
        if isinstance(payload, list):
            raw_tasks = payload
            weights = None
            strategy = request.query_params.get('strategy', 'smart')

        elif isinstance(payload, dict) and 'tasks' in payload:
            raw_tasks = payload.get('tasks') or []
            weights = payload.get('weights')
            strategy = payload.get('strategy', request.query_params.get('strategy', 'smart'))

        else:
            return Response(
                {"detail": "POST a JSON array or { 'tasks': [...] }"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate each task using TaskSerializer

        validated = []
        errors = []

        for idx, t in enumerate(raw_tasks):
            s = TaskSerializer(data=t)
            if s.is_valid():
                validated.append(s.validated_data)
            else:
                errors.append({"index": idx, "errors": s.errors})

        # If validation errors exist, return them
        if errors:
            return Response(
                {"detail": "Validation errors", "errors": errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Map task titles to IDs for dependency resolution
        title_to_id = {
            t["title"]: str(t.get("id") or t["title"])
            for t in validated
        }

        # Replace dependency titles with IDs
        for t in validated:
            deps = t.get("dependencies") or []
            new_deps = []

            for d in deps:
                if d in title_to_id:
                    new_deps.append(title_to_id[d])  
                else:
                    new_deps.append(str(d))

            t["dependencies"] = new_deps

        # Detect circular dependencies and reject if found
        cycles = detect_cycles(validated)
        if cycles:
            return Response(
                {"detail": "Circular dependencies detected", "cycles": cycles},
                status=status.HTTP_400_BAD_REQUEST
            )

         # Convert string due dates to datetime.date objects
        for t in validated:
            due = t.get("due_date")
            if isinstance(due, str):
                try:
                    t["due_date"] = datetime.fromisoformat(due).date()
                except:
                    t["due_date"] = None

        
        # Compute scores for all tasks
        scored = compute_scores(validated, weights=weights, strategy=strategy)

        
        # Build a simple dependency graph (nodes and edges)
        all_ids = {task["id"] for task in scored}

        graph = {
            "nodes": [{"id": t["id"]} for t in scored],
            "edges": [
                {"from": t["id"], "to": dep}
                for t in scored
                for dep in (t.get("dependencies") or [])
                if dep in all_ids
            ]
        }

        # Return scored tasks, any cycles, and the dependency graph
        return Response(
            {"tasks": scored, "cycles": cycles, "graph": graph},
            status=status.HTTP_200_OK
        )




class SuggestTasksAPIView(APIView):
    
    # API endpoint to suggest top priority tasks (top 3 by score).
    # Returns the suggested tasks with explanation ('why').

    def get(self, request):

        # GET is not allowed; instruct user to POST
        return Response(
            {'detail': 'Please POST to this endpoint with { "tasks": [...] }'},
            status=status.HTTP_400_BAD_REQUEST
        )

    def post(self, request):
        payload = request.data

        # Expect payload to be a dict with 'tasks'

        if isinstance(payload, dict) and 'tasks' in payload:
            raw_tasks = payload.get('tasks') or []
            weights = payload.get('weights')
            strategy = payload.get('strategy', 'smart')
        else:
            return Response(
                {'detail': "POST { 'tasks': [...] }"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate tasks
        validated = []


        errors = []
        for idx, t in enumerate(raw_tasks):
            serializer = TaskSerializer(data=t)
            if serializer.is_valid():
                validated.append(serializer.validated_data)
            else:
                errors.append({'index': idx, 'errors': serializer.errors})

        if errors:
            return Response(
                {'detail': 'Validation errors', 'errors': errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Map task titles to IDs for dependency resolution
        title_to_id = {t["title"]: str(t.get("id") or t["title"]) for t in validated}

        # Update dependencies to use IDs
        for t in validated:
            deps = t.get("dependencies") or []
            new_deps = []
            for d in deps:
                if d in title_to_id:
                    new_deps.append(title_to_id[d])
                else:
                    new_deps.append(d)
            t["dependencies"] = new_deps


         # Detect circular dependencies
        cycles = detect_cycles(validated)
        if cycles:
            return Response(
                {'detail': 'Circular dependencies detected', 'cycles': cycles},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Convert string due dates to datetime.date objects
        for t in validated:
            due = t.get('due_date')
            if isinstance(due, str):
                try:
                    t['due_date'] = datetime.fromisoformat(due).date()
                except Exception:
                    t['due_date'] = None

        # Compute scores
        scored = compute_scores(validated, weights=weights, strategy=strategy)

        # Select top 3 tasks as suggestions
        top3 = scored[:3]
        suggestions = []

        for s in top3:
            reasons = []
            meta = s.get('_meta', {})

            # Determine reasons for suggestion based on scoring factors

            if meta.get('urgency_norm', 0) > 0.6:
                reasons.append('urgent (due soon/overdue)')
            if meta.get('importance_norm', 0) > 0.6:
                reasons.append('high importance')
            if meta.get('effort_norm', 0) > 0.6:
                reasons.append('quick win (low effort)')
            if s.get('dependencies'):
                reasons.append('has dependencies')
            if s.get('id') and any([s['id'] in (t.get('dependencies') or []) for t in validated]):
                reasons.append('blocking other tasks')

            if not reasons:
                reasons.append('balanced priority')

            suggestions.append({
                'task': s,
                'why': reasons
            })

        # Return top suggestions with explanations
        return Response(
            {'suggestions': suggestions},
            status=status.HTTP_200_OK
        )
