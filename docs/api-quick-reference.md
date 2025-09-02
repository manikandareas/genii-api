# API Quick Reference

## Endpoint

```
POST /api/events
```

**Authentication**: Requires Clerk JWT token in Authorization header

## Event Types

### 1. session_started

**Purpose**: Begin a new learning session

```json
{
  "eventType": "session_started",
  "courseId": "course-123",           // optional
  "metadata": {                       // optional
    "platform": "web",
    "device": "desktop"
  }
}
```

**Required Fields**: `eventType`  
**Optional Fields**: `courseId`, `metadata`

### 2. lesson_completed

**Purpose**: Record lesson completion with time tracking

```json
{
  "eventType": "lesson_completed",
  "contentId": "lesson-456",          // required
  "courseId": "course-123",           // optional
  "timeSpent": 25,                    // optional (minutes)
  "metadata": {                       // optional
    "difficulty": "beginner",
    "completionRate": 100
  }
}
```

**Required Fields**: `eventType`, `contentId`  
**Optional Fields**: `courseId`, `timeSpent`, `metadata`  
**XP Reward**: 50 XP

### 3. quiz_completed

**Purpose**: Record quiz completion with performance metrics

```json
{
  "eventType": "quiz_completed",
  "contentId": "quiz-789",            // required
  "courseId": "course-123",           // optional
  "timeSpent": 10,                    // optional (minutes)
  "metadata": {                       // optional
    "score": 8,
    "percentage": 80,
    "totalQuestions": 10,
    "correctAnswers": 8
  }
}
```

**Required Fields**: `eventType`, `contentId`  
**Optional Fields**: `courseId`, `timeSpent`, `metadata`  
**XP Reward**: 0-100 XP based on percentage score

### 4. session_ended

**Purpose**: End the current learning session

```json
{
  "eventType": "session_ended",
  "metadata": {                       // optional
    "reason": "manual"
  }
}
```

**Required Fields**: `eventType`  
**Optional Fields**: `metadata`

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

## Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `EVENT_PROCESSING_FAILED` | General event processing error | Check event payload format |
| `USER_NOT_FOUND` | User not authenticated or doesn't exist | Verify Clerk authentication |
| `VALIDATION_ERROR` | Invalid event data | Check required fields and data types |
| `INTERNAL_SERVER_ERROR` | Server-side processing error | Retry request or contact support |

## Authentication

Include Clerk JWT token in Authorization header:

```javascript
fetch('/api/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${clerkToken}`
  },
  body: JSON.stringify(eventPayload)
});
```

## Field Validation

### eventType
- **Type**: string
- **Required**: Yes
- **Valid values**: `"session_started"`, `"lesson_completed"`, `"quiz_completed"`, `"session_ended"`

### contentId
- **Type**: string  
- **Required**: Yes for `lesson_completed` and `quiz_completed`
- **Format**: Any string identifier for the lesson/quiz

### courseId
- **Type**: string
- **Required**: No
- **Purpose**: Links activity to specific course for enrollment tracking

### timeSpent
- **Type**: number
- **Required**: No
- **Unit**: Minutes
- **Validation**: Must be >= 0

### metadata
- **Type**: object
- **Required**: No
- **Purpose**: Additional context data for analytics
- **Common fields**:
  - `platform`: "web", "mobile", "tablet"
  - `difficulty`: "beginner", "intermediate", "advanced"
  - `score`: Quiz score (number)
  - `percentage`: Quiz percentage (0-100)
  - `totalQuestions`: Total quiz questions (number)

## Quick Examples

### Start Study Session
```bash
curl -X POST /api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CLERK_TOKEN" \
  -d '{
    "eventType": "session_started",
    "courseId": "javascript-basics"
  }'
```

### Complete Lesson
```bash
curl -X POST /api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CLERK_TOKEN" \
  -d '{
    "eventType": "lesson_completed",
    "contentId": "js-variables",
    "courseId": "javascript-basics",
    "timeSpent": 15
  }'
```

### Submit Quiz
```bash
curl -X POST /api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CLERK_TOKEN" \
  -d '{
    "eventType": "quiz_completed",
    "contentId": "js-quiz-1",
    "courseId": "javascript-basics",
    "timeSpent": 8,
    "metadata": {
      "score": 9,
      "percentage": 90,
      "totalQuestions": 10
    }
  }'
```

### End Session
```bash
curl -X POST /api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CLERK_TOKEN" \
  -d '{
    "eventType": "session_ended"
  }'
```

## Rate Limits

- **Limit**: 100 requests per minute per user
- **Exceeded**: HTTP 429 with retry-after header
- **Recommendation**: Implement client-side rate limiting and queuing

## Data Updates

Each successful event triggers updates to:

1. **Learning Session**: Activity tracking, duration calculation
2. **User Analytics**: XP, levels, study time, streaks  
3. **Course Enrollment**: Progress tracking, completion percentage
4. **Background Jobs**: Advanced analytics processing (async)

## Testing

### Development Environment
```javascript
// Test event tracking in browser console
fetch('/api/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventType: 'lesson_completed',
    contentId: 'test-lesson',
    timeSpent: 5
  })
}).then(r => r.json()).then(console.log);
```

### Validation
- Check network tab for request/response details
- Verify Sanity database updates in real-time
- Monitor background job processing in Inngest dashboard