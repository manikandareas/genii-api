# Event Handler Usage Guide

The centralized event handler at `/api/events` processes user activity events and updates both `learningSession` records and user analytics.

## Event Types

### 1. session_started
Initiates a new learning session when user begins studying.

```json
POST /api/events
{
  "eventType": "session_started",
  "courseId": "course-id-123", // optional
  "metadata": {
    "platform": "web",
    "device": "desktop"
  }
}
```

### 2. lesson_completed  
Records completion of a lesson with time tracking and XP calculation.

```json
POST /api/events
{
  "eventType": "lesson_completed",
  "contentId": "lesson-id-456",
  "courseId": "course-id-123", // optional
  "timeSpent": 25, // minutes
  "metadata": {
    "difficulty": "beginner",
    "completionRate": 100
  }
}
```

### 3. quiz_completed
Records quiz completion with performance metrics and XP calculation.

```json
POST /api/events
{
  "eventType": "quiz_completed", 
  "contentId": "quiz-id-789",
  "courseId": "course-id-123", // optional
  "timeSpent": 10, // minutes
  "metadata": {
    "score": 85,
    "percentage": 85,
    "totalQuestions": 10,
    "correctAnswers": 8.5
  }
}
```

### 4. session_ended
Finalizes the active learning session with duration calculation.

```json
POST /api/events
{
  "eventType": "session_ended",
  "metadata": {
    "reason": "manual", // "manual", "timeout", "navigation"
  }
}
```

## Response Format

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "message": "Lesson completion recorded successfully"
  }
}
```

### Error Response (400)
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "EVENT_PROCESSING_FAILED",
    "message": "contentId is required for lesson_completed event"
  }
}
```

## Data Updates

Each event triggers multiple data updates:

### Learning Session Updates
- Creates new session for `session_started`
- Adds activities to active session for `lesson_completed`/`quiz_completed`
- Calculates and sets duration for `session_ended`

### User Analytics Updates
- **XP Calculation**: Lessons (50 XP), Quizzes (0-100 XP based on score), Reading (25 XP)
- **Level Progression**: Based on total XP with progressive requirements
- **Study Time Tracking**: Total minutes and average session time
- **Streak Management**: Daily activity streak calculation

### Enrollment Progress
- Updates `contentsCompleted` array
- Recalculates `percentComplete` for course progress

### Background Processing
- Triggers Inngest jobs for additional analytics processing
- Handles skill analysis and achievement calculations asynchronously

## Frontend Integration

### Basic Usage Pattern
```typescript
// When user starts studying
await fetch('/api/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventType: 'session_started',
    courseId: currentCourse.id
  })
});

// When user completes lesson
await fetch('/api/events', {
  method: 'POST', 
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventType: 'lesson_completed',
    contentId: lesson.id,
    courseId: currentCourse.id,
    timeSpent: 25,
    metadata: { difficulty: lesson.difficulty }
  })
});

// When user finishes studying
await fetch('/api/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventType: 'session_ended'
  })
});
```

### Error Handling
```typescript
async function trackEvent(eventData) {
  try {
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData)
    });
    
    const result = await response.json();
    
    if (!result.success) {
      console.error('Event tracking failed:', result.error);
      // Implement retry logic or offline storage
    }
  } catch (error) {
    console.error('Event tracking request failed:', error);
    // Handle network errors
  }
}
```

## Authentication

All event endpoints require Clerk authentication. The JWT token must be included in the Authorization header:

```typescript
fetch('/api/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${clerkToken}`
  },
  body: JSON.stringify(eventData)
});
```