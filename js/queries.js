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

// With arguments
export const Q_OBJECT_BY_ID = /* GraphQL */`
query OneObject($id: Int!) {
  object(where: { id: { _eq: $id }}) {
    id
    name
    type
  }
}
`;

// Nested
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

// XP for charts
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
