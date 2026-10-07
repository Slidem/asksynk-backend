import { IsIn } from "class-validator";

import { DeadLetterTransition } from "@/api/platform/events/dead-letters/events-dead-letters.service";

export const DEAD_LETTER_TRANSITIONS: DeadLetterTransition[] = [
  "replayed",
  "discarded",
];

export class PatchDeadLetterRequestDto {
  @IsIn(DEAD_LETTER_TRANSITIONS)
  status!: DeadLetterTransition;
}
