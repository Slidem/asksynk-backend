import { EventInstanceId } from "../models/calendar-event-instance.model";

export const getInstanceId = (
  eventId: string,
  start: Date,
): EventInstanceId => {
  return `${eventId}-${start.getTime()}`;
};
