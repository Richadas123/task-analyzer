from rest_framework import serializers
from datetime import datetime, date

class TaskSerializer(serializers.Serializer):

    # Task ID (optional, allows string IDs)
    id = serializers.CharField(required=False)  

    # Task title (required, non-empty)
    title = serializers.CharField()

    # Task due date (required)
    due_date = serializers.DateField(required=True)

    # Estimated hours for task completion (required, must be >= 0)
    estimated_hours = serializers.FloatField(min_value=0, required=True)

    # Importance rating of the task (required, 1-10)
    importance = serializers.IntegerField(min_value=1, max_value=10, required=True)

    # List of task IDs that this task depends on (optional)
    dependencies = serializers.ListField(child=serializers.CharField(), required=False, default=list)

    def validate(self, data):
        # minimal validation
        # Custom validation to ensure the title is not empty or just whitespace.

        if 'title' not in data or not data['title'].strip():
            raise serializers.ValidationError("Task must have a non-empty title.")
        return data

