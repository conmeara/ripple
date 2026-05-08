import { and, eq } from "drizzle-orm"
import { revisions } from "../db/schema"
import type { getDatabase } from "../db"

type Db = ReturnType<typeof getDatabase>

export function markStaleProjectRevisionsUpdating(input: {
  db: Db
  projectId: string
  currentCommit: string
  acceptedRevisionId?: string | null
}): number {
  const now = new Date()
  const staleRevisions = input.db
    .select()
    .from(revisions)
    .where(and(
      eq(revisions.projectId, input.projectId),
      eq(revisions.status, "proposed"),
    ))
    .all()
    .filter((revision) =>
      revision.id !== input.acceptedRevisionId &&
      Boolean(revision.baseProjectCommit) &&
      revision.baseProjectCommit !== input.currentCommit,
    )

  for (const revision of staleRevisions) {
    input.db.update(revisions)
      .set({
        status: "updating",
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(revisions.id, revision.id))
      .run()
  }

  return staleRevisions.length
}
