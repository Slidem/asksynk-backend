import { Injectable } from "@nestjs/common";

/** Injectable time source so time-dependent logic can be made deterministic in tests. */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
