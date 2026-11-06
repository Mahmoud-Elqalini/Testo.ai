import { record, parseJson } from "./context.ts";

const ownerA = "ownerA";
const ownerB = "ownerB";
const participant = "participantA";
const groupA = "b7000000-0000-4000-8000-000000000001";
const examA = "c7000000-0000-4000-8000-000000000001";
const participantId = "a7000000-0000-4000-8000-000000000003";

async function list(ctx: any, actor: string | undefined, kind: "group" | "exam", id: string) {
  const response = await ctx.request("/rest/v1/rpc/list_associated_participants", actor, {
    method: "POST",
    body: JSON.stringify({ p_context_kind: kind, p_context_id: id }),
  });
  return { response, body: parseJson(await response.text()) };
}

function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value as Record<string, unknown>[] : []; }
function keysAreExact(value: Record<string, unknown>) {
  return Object.keys(value).sort().join(",") === "display_name,email,id";
}

export async function runParticipantListCases(ctx: any) {
  const ownerResult = await list(ctx, ownerA, "group", groupA);
  const ownerRows = rows(ownerResult.body);
  const endpointAvailable = ownerResult.response.ok;
  await record(ctx, "contract:participant_list.group_owner_allow",
    ownerResult.response.ok && ownerRows.some((row) => row.id === participantId && row.display_name === "007 Participant A" && row.email === "participant-a-007@example.test"),
    `HTTP ${ownerResult.response.status}; group owner receives associated id, display name, and email`);
  await record(ctx, "contract:participant_list.field_allowlist",
    ownerRows.length > 0 && ownerRows.every(keysAreExact),
    "every row contains exactly id, display_name, and email");
  await record(ctx, "contract:participant_list.no_owner_row",
    endpointAvailable && !ownerRows.some((row) => row.id === "a7000000-0000-4000-8000-000000000001"),
    "the owner is not returned as a participant");

  const nonOwner = await list(ctx, ownerB, "group", groupA);
  await record(ctx, "contract:participant_list.non_owner_deny",
    endpointAvailable && (!nonOwner.response.ok || rows(nonOwner.body).length === 0),
    `HTTP ${nonOwner.response.status}; non-owner receives no participant data`);
  const unauthenticated = await list(ctx, undefined, "group", groupA);
  await record(ctx, "contract:participant_list.anon_deny",
    endpointAvailable && (!unauthenticated.response.ok || rows(unauthenticated.body).length === 0),
    `HTTP ${unauthenticated.response.status}; anonymous caller receives no participant data`);

  const examRows = await list(ctx, ownerA, "exam", examA);
  await record(ctx, "contract:participant_list.exam_member_and_attempt_union",
    examRows.response.ok && rows(examRows.body).some((row) => row.id === participantId),
    `HTTP ${examRows.response.status}; exam owner sees associated member/attempt holder`);

  // A removed member disappears from the group list immediately, while the
  // extant attempt keeps them visible for exam grade review. Restore the
  // synthetic membership even when an assertion or RPC fails.
  ctx.runSql(`DELETE FROM public.group_students WHERE group_id='${groupA}'::uuid AND student_id='${participantId}'::uuid`);
  try {
    const removedGroup = await list(ctx, ownerA, "group", groupA);
    await record(ctx, "contract:participant_list.removal_immediate_group",
      endpointAvailable && removedGroup.response.ok && !rows(removedGroup.body).some((row) => row.id === participantId),
      "the next group-list read hides a removed member");
    const retainedExam = await list(ctx, ownerA, "exam", examA);
    await record(ctx, "contract:participant_list.attempt_retains_exam_visibility",
      endpointAvailable && retainedExam.response.ok && rows(retainedExam.body).some((row) => row.id === participantId),
      "an existing attempt retains exam-list visibility after group removal");
  } finally {
    ctx.runSql(`INSERT INTO public.group_students (group_id, student_id) VALUES ('${groupA}'::uuid, '${participantId}'::uuid) ON CONFLICT DO NOTHING`);
  }
}
