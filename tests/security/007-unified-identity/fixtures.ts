/** Deterministic, local-only fixture identities for the 007 security baseline. */
export const fixtureManifest = {
  version: 1,
  namespace: "007-unified-identity-before-v1",
  actors: {
    ownerA: { id: "a7000000-0000-4000-8000-000000000001", email: "owner-a-007@example.test", role: "admin", password: "LocalOnly-007-owner-a!" },
    ownerB: { id: "a7000000-0000-4000-8000-000000000002", email: "owner-b-007@example.test", role: "admin", password: "LocalOnly-007-owner-b!" },
    participantA: { id: "a7000000-0000-4000-8000-000000000003", email: "participant-a-007@example.test", role: "student", password: "LocalOnly-007-participant-a!" },
    unrelated: { id: "a7000000-0000-4000-8000-000000000004", email: "unrelated-007@example.test", role: "student", password: "LocalOnly-007-unrelated!" },
  },
  resources: {
    groupA: "b7000000-0000-4000-8000-000000000001",
    groupB: "b7000000-0000-4000-8000-000000000002",
    examA: "c7000000-0000-4000-8000-000000000001",
    examB: "c7000000-0000-4000-8000-000000000002",
    examRpc: "c7000000-0000-4000-8000-000000000003",
    examEdge: "c7000000-0000-4000-8000-000000000004",
    questionA: "d7000000-0000-4000-8000-000000000001",
    questionRpc: "d7000000-0000-4000-8000-000000000002",
    questionEdge: "d7000000-0000-4000-8000-000000000003",
    attemptA: "e7000000-0000-4000-8000-000000000001",
    answerA: "f7000000-0000-4000-8000-000000000001",
  },
  relationships: [
    { kind: "ownership", owner: "ownerA", resource: "groupA" },
    { kind: "ownership", owner: "ownerB", resource: "groupB" },
    { kind: "ownership", owner: "ownerA", resource: "examA" },
    { kind: "ownership", owner: "ownerB", resource: "examB" },
    { kind: "membership", actor: "participantA", resource: "groupA" },
    { kind: "exam_permission", group: "groupA", resource: "examA" },
    { kind: "attempt", actor: "participantA", resource: "examA" },
  ],
} as const;

export type FixtureManifest = typeof fixtureManifest;
