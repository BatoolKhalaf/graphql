// js/queries.js

// Simple
export const Q_ME = /* GraphQL */`
query Me {
  user {
    id
    login
    email
  }
}
`;

// With arguments (kept for reference/other features)
export const Q_OBJECT_BY_ID = /* GraphQL */`
query OneObject($id: Int!) {
  object(where: { id: { _eq: $id }}) {
    id
    name
    type
  }
}
`;

// Nested (latest results for the feed)
export const Q_RESULTS_WITH_USER = /* GraphQL */`
query ResultsWithUser {
  result(limit: 5, order_by: {createdAt: desc}) {
    id
    grade
    type
    createdAt
    user { id login }
  }
}
`;

// All XP transactions for a user (we'll dedupe and filter in app.js)
export const Q_XP = /* GraphQL */`
query XP($userId: Int!) {
  transaction(
    where: { userId: { _eq: $userId }, type: { _eq: "xp" } }
    order_by: { createdAt: asc }
    limit: 10000
  ) {
    amount
    objectId
    createdAt
    path
  }
}
`;

// Resolve object names for a set of ids
export const Q_OBJECT_NAMES = /* GraphQL */`
query ObjectNames($ids: [Int!]) {
  object(where: { id: { _in: $ids }}) {
    id
    name
    type
  }
}
`;

/*
 * NEW: Passed objects with details so we can mimic dashboard rules:
 * - grade = 1 (validated)
 * - include object { type } to restrict to "project"
 * - include progress.path to exclude piscine/exam/checkpoint etc
 */
export const Q_PASSED_OBJECTS_DETAILED = /* GraphQL */`
query PassedObjectsDetailed($userId: Int!) {
  progress(
    where: { userId: { _eq: $userId }, grade: { _eq: 1 } }
  ) {
    objectId
    createdAt
    path
    object { id name type }
  }
}
`;
