import { ApiProperty } from "@nestjs/swagger";

export class BreakSuggestionResponse {
  @ApiProperty({
    enum: ["short_break", "long_break"],
    enumName: "BreakSessionType",
  })
  suggestedSessionType!: "short_break" | "long_break";

  completedFocusSessions!: number;
  longBreakInterval!: number;
}
