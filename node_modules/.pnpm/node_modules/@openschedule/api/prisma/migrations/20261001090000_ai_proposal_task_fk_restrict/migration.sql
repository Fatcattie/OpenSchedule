-- R1: AiProposalTask is an append-only audit association; deleting a task must not
-- silently null the required task_id. Keep the association intact and reject hard deletes.
ALTER TABLE "ai_proposal_tasks"
DROP CONSTRAINT "ai_proposal_tasks_task_id_fkey";

ALTER TABLE "ai_proposal_tasks"
ADD CONSTRAINT "ai_proposal_tasks_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
