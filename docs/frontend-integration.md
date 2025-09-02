# Frontend Integration Guide

## Quick Setup

### 1. Basic Event Tracking Function

Create a utility function to handle all event tracking:

```typescript
// utils/eventTracker.ts
interface EventPayload {
  eventType: 'session_started' | 'lesson_completed' | 'quiz_completed' | 'session_ended';
  contentId?: string;
  courseId?: string;
  timeSpent?: number;
  metadata?: Record<string, any>;
}

export async function trackEvent(payload: EventPayload): Promise<boolean> {
  try {
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (!result.success) {
      console.error('Event tracking failed:', result.error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Event tracking request failed:', error);
    return false;
  }
}
```

### 2. React Hook for Event Tracking

Create a custom hook to manage event tracking with state:

```typescript
// hooks/useEventTracking.ts
import { useCallback, useRef } from 'react';
import { trackEvent } from '../utils/eventTracker';

export function useEventTracking() {
  const sessionStartTimeRef = useRef<Date | null>(null);
  const activityStartTimeRef = useRef<Date | null>(null);

  const startSession = useCallback(async (courseId?: string) => {
    sessionStartTimeRef.current = new Date();
    return await trackEvent({
      eventType: 'session_started',
      courseId,
      metadata: {
        platform: 'web',
        timestamp: sessionStartTimeRef.current.toISOString()
      }
    });
  }, []);

  const completeLesson = useCallback(async (lessonId: string, courseId?: string) => {
    const timeSpent = activityStartTimeRef.current 
      ? Math.floor((Date.now() - activityStartTimeRef.current.getTime()) / (1000 * 60))
      : 0;

    return await trackEvent({
      eventType: 'lesson_completed',
      contentId: lessonId,
      courseId,
      timeSpent,
      metadata: {
        completedAt: new Date().toISOString()
      }
    });
  }, []);

  const completeQuiz = useCallback(async (
    quizId: string, 
    score: number, 
    totalQuestions: number,
    courseId?: string
  ) => {
    const timeSpent = activityStartTimeRef.current 
      ? Math.floor((Date.now() - activityStartTimeRef.current.getTime()) / (1000 * 60))
      : 0;

    const percentage = Math.floor((score / totalQuestions) * 100);

    return await trackEvent({
      eventType: 'quiz_completed',
      contentId: quizId,
      courseId,
      timeSpent,
      metadata: {
        score,
        percentage,
        totalQuestions,
        correctAnswers: score,
        completedAt: new Date().toISOString()
      }
    });
  }, []);

  const endSession = useCallback(async () => {
    sessionStartTimeRef.current = null;
    return await trackEvent({
      eventType: 'session_ended',
      metadata: {
        reason: 'manual',
        endedAt: new Date().toISOString()
      }
    });
  }, []);

  const startActivity = useCallback(() => {
    activityStartTimeRef.current = new Date();
  }, []);

  return {
    startSession,
    completeLesson,
    completeQuiz,
    endSession,
    startActivity
  };
}
```

## Usage Examples

### Lesson Component

```typescript
// components/LessonViewer.tsx
import { useEventTracking } from '../hooks/useEventTracking';
import { useEffect } from 'react';

interface LessonViewerProps {
  lesson: {
    id: string;
    title: string;
    courseId: string;
  };
}

export function LessonViewer({ lesson }: LessonViewerProps) {
  const { startActivity, completeLesson } = useEventTracking();

  // Start tracking when component mounts
  useEffect(() => {
    startActivity();
  }, [startActivity]);

  const handleLessonComplete = async () => {
    const success = await completeLesson(lesson.id, lesson.courseId);
    
    if (success) {
      // Show success message, redirect, etc.
      console.log('Lesson completion tracked successfully');
    }
  };

  return (
    <div>
      <h1>{lesson.title}</h1>
      {/* Lesson content */}
      <button onClick={handleLessonComplete}>
        Mark as Complete
      </button>
    </div>
  );
}
```

### Quiz Component

```typescript
// components/QuizComponent.tsx
import { useEventTracking } from '../hooks/useEventTracking';
import { useState } from 'react';

interface QuizComponentProps {
  quiz: {
    id: string;
    questions: Array<{ id: string; question: string; correctAnswer: number }>;
    courseId: string;
  };
}

export function QuizComponent({ quiz }: QuizComponentProps) {
  const { startActivity, completeQuiz } = useEventTracking();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleQuizStart = () => {
    startActivity(); // Start timing the quiz
  };

  const handleQuizSubmit = async () => {
    // Calculate score
    const correctAnswers = quiz.questions.reduce((score, question) => {
      return answers[question.id] === question.correctAnswer ? score + 1 : score;
    }, 0);

    const success = await completeQuiz(
      quiz.id,
      correctAnswers,
      quiz.questions.length,
      quiz.courseId
    );

    if (success) {
      setIsSubmitted(true);
      console.log('Quiz completion tracked successfully');
    }
  };

  return (
    <div>
      {!isSubmitted ? (
        <>
          <button onClick={handleQuizStart}>Start Quiz</button>
          {/* Quiz questions */}
          <button onClick={handleQuizSubmit}>Submit Quiz</button>
        </>
      ) : (
        <div>Quiz completed and tracked!</div>
      )}
    </div>
  );
}
```

### Session Management Component

```typescript
// components/StudySession.tsx
import { useEventTracking } from '../hooks/useEventTracking';
import { useEffect } from 'react';

interface StudySessionProps {
  courseId?: string;
  children: React.ReactNode;
}

export function StudySession({ courseId, children }: StudySessionProps) {
  const { startSession, endSession } = useEventTracking();

  // Start session when component mounts
  useEffect(() => {
    startSession(courseId);
    
    // End session when component unmounts or user leaves
    const handleBeforeUnload = () => {
      endSession();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      endSession(); // End session on component unmount
    };
  }, [courseId, startSession, endSession]);

  return <div>{children}</div>;
}
```

## Error Handling & Retry Logic

### Enhanced Event Tracker with Retry

```typescript
// utils/eventTracker.ts (enhanced version)
interface QueuedEvent extends EventPayload {
  timestamp: number;
  retryCount: number;
}

class EventTracker {
  private eventQueue: QueuedEvent[] = [];
  private isOnline = navigator.onLine;

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', this.processQueue.bind(this));
    window.addEventListener('offline', () => { this.isOnline = false; });
  }

  async trackEvent(payload: EventPayload, maxRetries = 3): Promise<boolean> {
    if (!this.isOnline) {
      this.queueEvent(payload);
      return false;
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
          const result = await response.json();
          return result.success;
        } else if (attempt === maxRetries) {
          this.queueEvent(payload);
          return false;
        }
      } catch (error) {
        if (attempt === maxRetries) {
          this.queueEvent(payload);
          return false;
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return false;
  }

  private queueEvent(payload: EventPayload) {
    this.eventQueue.push({
      ...payload,
      timestamp: Date.now(),
      retryCount: 0
    });
  }

  private async processQueue() {
    this.isOnline = true;
    
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (event) {
        const success = await this.trackEvent(event, 2);
        if (!success && event.retryCount < 3) {
          event.retryCount++;
          this.eventQueue.push(event);
        }
      }
    }
  }
}

export const eventTracker = new EventTracker();
export const trackEvent = (payload: EventPayload) => eventTracker.trackEvent(payload);
```

## Best Practices

### 1. Time Tracking Accuracy
- Start timing when user begins activity, not when component mounts
- Use `startActivity()` when user actually engages with content
- Account for user pauses/distractions in your timing logic

### 2. Offline Handling
- Queue events when offline and sync when connection returns
- Provide user feedback about sync status
- Consider local storage for persistence across browser sessions

### 3. Error Recovery
- Implement retry logic with exponential backoff
- Log failed events for debugging
- Provide graceful degradation when tracking fails

### 4. Performance
- Avoid tracking too frequently (debounce rapid events)
- Batch similar events when possible
- Don't block UI for tracking operations

### 5. Privacy & Data
- Only track necessary metadata
- Respect user privacy preferences  
- Consider GDPR/privacy law requirements for analytics data