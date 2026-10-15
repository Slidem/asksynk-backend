import { Injectable } from "@nestjs/common";

import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { TaskSuggestionBroadcast } from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { RealtimeBroadcaster } from "@/api/platform/realtime/realtime-broadcaster";

@Injectable()
export class TaskSuggestionsBroadcaster {
  constructor(private readonly broadcaster: RealtimeBroadcaster) {}

  // Inline task suggestion changed (status or a materialized task) — push the
  // full suggestion to BOTH participants so each side's card stays live.
  @EventHandler(TaskSuggestionBroadcast)
  async onTaskSuggestionBroadcast(
    payload: EventOf<typeof TaskSuggestionBroadcast>,
  ): Promise<void> {
    const { suggestion } = payload;
    this.broadcaster.emit(
      [
        { kind: "user", id: suggestion.suggesterUserId },
        { kind: "user", id: suggestion.suggesteeUserId },
      ],
      "suggestion.updated",
      { suggestion },
    );
  }
}
