import { Injectable } from "@nestjs/common";

/** Injectable time source so time-dependent logic can be made deterministic in tests. */
export abstract class Clock {
  abstract now(): Date;
}

/**
 * A system clock implementation of Clock that returns the current wall-clock time.
 */
@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
