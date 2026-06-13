import { IsIn, IsOptional } from "class-validator";

import { TaskSuggestionStatus } from "@/api/tasks/models/task.model";

export class ListTaskSuggestionsQueryDto {
  @IsIn(["sent", "received"])
  role!: "sent" | "received";

  @IsOptional()
  @IsIn(["pending", "accepted", "rejected"])
  status?: TaskSuggestionStatus;
}
