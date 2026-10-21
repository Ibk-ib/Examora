/**
 * Central configuration. Change API_BASE_URL here (and nowhere else) for local
 * development vs. deployment. The ASP.NET dev defaults are listed below.
 *   HTTPS: https://localhost:7297
 *   HTTP : http://localhost:5219
 */
export const CONFIG = Object.freeze({
  API_BASE_URL: 'https://localhost:7297',

  /** Default rows per page for unfiltered (server-paginated) lists. */
  PAGE_SIZE: 10,

  /**
   * The API has no search/filter parameters, so searches run client-side over
   * records fetched page by page. These bound that work.
   */
  FETCH_ALL_PAGE_SIZE: 100,
  FETCH_ALL_MAX_PAGES: 10,

  REQUEST_TIMEOUT_MS: 30000,

  /**
   * How a chosen answer is sent as `selectedAnswer` / `correctAnswer`.
   * The Swagger file does not say. 'letter' sends "A".."D"; 'text' sends the
   * option's text. Flip this one value if your backend compares option text.
   */
  ANSWER_FORMAT: 'letter',

  /** Roles are matched case-insensitively against the `role` returned by login. */
  ADMIN_ROLE: 'admin',
  STUDENT_ROLE: 'student',
});
