

from django.test import TestCase
from .scoring import compute_scores, detect_cycles
from datetime import date, timedelta

class ScoringTests(TestCase):

    # Test that tasks with sooner due dates get higher urgency scores
    def test_urgency_increases_for_soon_due(self):
        today = date.today()
        tasks = [
            {"id": "1", "title": "Far", "due_date": today + timedelta(days=30), "estimated_hours": 2, "importance": 5, "dependencies": []},
            {"id": "2", "title": "Soon", "due_date": today + timedelta(days=1), "estimated_hours": 4, "importance": 5, "dependencies": []},
        ]
        scored = compute_scores(tasks)
        ids = [t['id'] for t in scored]

        # Expect the task with the sooner due date to rank first
        self.assertEqual(ids[0], "2")  

    # Test that tasks which are depended upon by others get a higher dependency score
    def test_dependency_boost(self):
        today = date.today()
        tasks = [
            {"id": "A", "title": "A", "due_date": None, "estimated_hours": 5, "importance": 5, "dependencies": []},
            {"id": "B", "title": "B", "due_date": None, "estimated_hours": 2, "importance": 5, "dependencies": ["A"]},
        ]
        scored = compute_scores(tasks)
        
        top_id = scored[0]['id']

        # Expect task "A" to score higher because "B" depends on it
        self.assertEqual(top_id, "A")

    # Test cycle detection in task dependencies
    def test_detect_cycles(self):
        tasks = [
            {"id": "1", "title": "T1", "dependencies": ["2"]},
            {"id": "2", "title": "T2", "dependencies": ["3"]},
            {"id": "3", "title": "T3", "dependencies": ["1"]},
        ]
        cycles = detect_cycles(tasks)

        # Expect at least one cycle to be detected
        self.assertTrue(len(cycles) >= 1)


