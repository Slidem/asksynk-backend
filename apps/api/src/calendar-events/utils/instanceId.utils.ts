import { EventInstanceId } from "../models/calendar-event-instance.model";

export const getInstanceId = (
  eventId: string,
  start: Date,
): EventInstanceId => {
  return `${eventId}-${start.getTime()}`;
};

export const getEventIdFromInstanceId = (
  instanceId: EventInstanceId,
): string => {
  const lastDashIndex = instanceId.lastIndexOf("-");
  if (lastDashIndex === -1) {
    throw new Error(`Invalid instanceId format: ${instanceId}`);
  }
  return instanceId.substring(0, lastDashIndex);
};
