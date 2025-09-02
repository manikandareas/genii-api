# Event System Overview

## What is the Event System?

The event system automatically tracks user learning activities and updates analytics in real-time. When users complete lessons, take quizzes, or study sessions, the system records progress, calculates XP, manages streaks, and updates course enrollment progress.

## Core Components

### 1. Event Handler (`/api/events`)
- Receives user activity events from frontend
- Validates event data and authenticates users
- Coordinates data updates across multiple systems

### 2. Learning Sessions
- Tracks study sessions with start/end times
- Records activities completed during each session
- Calculates total session duration automatically

### 3. User Analytics
- **Experience Points (XP)**: Lessons = 50 XP, Quizzes = 0-100 XP based on score
- **Level System**: Progressive levels based on total XP earned
- **Study Streaks**: Daily activity tracking with automatic streak calculation
- **Time Tracking**: Total study time and average session duration

### 4. Course Progress
- Updates enrollment completion percentage
- Tracks which lessons/quizzes are completed
- Links activities to specific courses

## How It Works

```
Frontend Event → API Validation → Database Updates → Background Processing
     ↓              ↓                    ↓                    ↓
User clicks     Authenticate      Learning Session      Analytics
"Complete"      & validate        + User Analytics      Processing
                event data        + Enrollment         (Inngest Jobs)
```

## Event Types

| Event Type | Purpose | Required Fields |
|------------|---------|----------------|
| `session_started` | Begin learning session | None |
| `lesson_completed` | Lesson finished | `contentId` |
| `quiz_completed` | Quiz finished | `contentId` |
| `session_ended` | End learning session | None |

## Database Updates

Each event triggers updates to multiple Sanity collections:

**Learning Session** (`learningSession` schema):
- Creates new session or adds activity to existing session
- Tracks individual activity completion with time spent
- Records session start/end times and total duration

**User Analytics** (`user.analytics` field):
- Calculates and adds XP for completed activities
- Updates current level based on total XP
- Recalculates study time totals and averages
- Manages daily streak counting

**Course Enrollment** (`enrollment` schema):
- Adds completed content to enrollment record
- Updates completion percentage for course progress
- Links activities to specific course context

## Key Benefits

### For Students
- **Motivation**: XP system and level progression gamify learning
- **Progress Tracking**: Clear visibility into course completion
- **Streak Building**: Daily study habit encouragement
- **Time Awareness**: Understanding of study time investment

### For Educators
- **Learning Analytics**: Detailed insights into student engagement
- **Progress Monitoring**: Real-time course completion tracking
- **Performance Metrics**: Quiz scores and completion rates
- **Usage Patterns**: Session duration and frequency data

### For Developers
- **Automated Tracking**: No manual analytics implementation needed
- **Consistent Data**: Standardized event format across platform
- **Real-time Updates**: Immediate reflection of user progress
- **Extensible**: Easy to add new event types and metrics

## Performance Features

- **Background Processing**: Heavy analytics calculations run asynchronously via Inngest
- **Error Handling**: Robust error recovery with detailed error messages  
- **Authentication**: Secure Clerk-based user verification
- **Data Validation**: Zod schema validation for all event payloads

## Getting Started

The simplest integration requires calling the event handler whenever users complete learning activities:

```javascript
// When user completes a lesson
fetch('/api/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventType: 'lesson_completed',
    contentId: 'lesson-123',
    timeSpent: 15
  })
});
```

This single call automatically updates learning sessions, user analytics, XP, levels, streaks, and course progress - providing comprehensive learning analytics with minimal frontend code.