export default async function globalTeardown() {
  // No teardown needed since we use a test database that can be reset easily.
  // If we wanted to do something here, it would have to be done by spawning a separate process,
  // since the main process will have already exited by the time this runs.
}
