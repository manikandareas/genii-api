import { defineQuery } from "groq";

export const chatMessageQuery = defineQuery(`
*[_type == "chatMessage" && _id == $messageId][0] {
  _id,
  _rev,
  _type,
  _createdAt,
  _updatedAt,
  messageId,
  session->{
    _id,
    _type,
    sessionId,
    status,
    createdAt,
    lastActivity,
    metadata
  },
  role,
  metadata {
    custom
  },
  parts[]
}`);

export const getActiveSessionQuery = defineQuery(
  `*[_type == "chatSession" && 
    references($userId) && 
    references($lessonId) && 
    status == "active"][0]`,
);

export const getUserByIdQuery = defineQuery(
  `*[_type == "user" && _id == $userId][0]`,
);

export const getUserByClerkIdQuery = defineQuery(
  `*[_type == "user" && clerkId == $clerkId][0]`,
);

export const getLessonByIdQuery = defineQuery(
  `*[_type == "lesson" && _id == $lessonId][0]`,
);

export const getUserLevelQuery = defineQuery(
  `*[_type == "user" && _id == $userId][0]{level}`,
);

export const getLessonTitleQuery = defineQuery(
  `*[_type == "lesson" && _id == $lessonId][0]{title}`,
);

export const getCoursesByIdsQuery = defineQuery(
  `*[_type == "course" && _id in $ids]`,
);

export const getExistingRecommendationQuery = defineQuery(
  `*[_type == "recommendation" && createdFor._ref == $userId][0]`,
);

export const getChatHistoryQuery = defineQuery(
  `*[_type == "chatMessage" && 
    references(*[_type == "chatSession" && 
      references($userId) && 
      references($lessonId) && 
      status == "active"]._id)
  ] | order(timestamp asc) {
    _id,
    role,
    content,
    timestamp,
    status
  }`,
);