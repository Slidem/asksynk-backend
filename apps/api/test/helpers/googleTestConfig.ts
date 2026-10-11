// SchedulingModule wires GoogleCalendarProvider, which reads these at construction.
// Dummy values: suites that import the module never call Google. (.env.test is gitignored.)
export const googleTestConfig = () => ({
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost/calendar-integrations/google/callback",
});
