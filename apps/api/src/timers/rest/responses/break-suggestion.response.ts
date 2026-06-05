export interface BreakSuggestionResponse {
  suggestedSessionType: "short_break" | "long_break";
  completedFocusSessions: number;
  longBreakInterval: number;
}
