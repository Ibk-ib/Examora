# Examora

**Examinations. Results. Progress.**

A frontend for the `UniversityAcademicApi` ASP.NET Core Web API. Plain HTML5, CSS3 and vanilla ES-module JavaScript with the Fetch API. No framework, no build step. Icons: Lucide (loaded from a pinned CDN build).

## Run it

ES modules need an HTTP server (opening `index.html` from disk will not work). From this folder, any static server works:

```bash
python3 -m http.server 5500      # or: npx serve -l 5500
```

Open `http://localhost:5500/index.html`.

## Configure the API URL

Edit **one line** in `js/config.js`:

```js
API_BASE_URL: 'https://localhost:7297',   // dev HTTP alternative: http://localhost:5219
```

Backend requirements (these are backend/environment settings, not something the frontend can bypass):

- **CORS** must allow this page's origin (for example `http://localhost:5500`), including the `Authorization` header and all methods used (GET, POST, PUT, DELETE).
- **HTTPS dev certificate** must be trusted. Open `https://localhost:7297/swagger` once in the same browser, or run `dotnet dev-certs https --trust`.

## Project structure

```
index.html               single entry page (hash-routed app)
css/                     variables, reset, layout, components, forms, tables,
                         auth, dashboards, examinations, responsive
js/
  config.js              API base URL and limits (the only place to change the URL)
  api.js                 fetch client: Bearer token, ResponseModel/PagedResponse/ProblemDetails, errors
  auth.js, guards.js     session handling and role route guards
  router.js, layout.js   hash router; auth / app / focus (exam) shells
  components.js          toasts, dialogs, tables, pager, empty/error states, charts
  validation.js          field builders, inline + server-error display
  listing.js, pagination.js   searchable, paginated lists
  services.js            endpoint wrappers + derived helpers
  grades.js, answers.js  GPA estimate and multiple-choice helpers
  pages/                 auth, dashboard, students, courses, enrollments, questions,
                         exams, exam-taking, attempts, results, performance, profile
```

`js/app.js`, `js/data.js`, `js/list-page.js` and `js/ui.js` pre-date this build, are not imported by anything, and can be deleted.

## How the API maps to the UI

| Area | Endpoints used |
|---|---|
| Auth | `POST /api/Auth/login` (matric number + password), `POST /api/Auth/register` |
| Students (admin) | `GET/POST /api/Students`, `PUT/DELETE /api/Students/{id}`, `GET /api/Students/get-by-matric-number` |
| Courses | `GET/POST /api/Courses`, `GET/PUT/DELETE /api/Courses/{id}` |
| Enrollments | `GET/POST /api/Enrollments`, `DELETE /api/Enrollments/{id}` |
| Questions | `GET/POST /api/Questions`, `GET /api/Questions/by-course/{id}`, `GET/PUT/DELETE /api/Questions/{id}` |
| Exams | `POST/GET /api/ExamAttempts`, `GET /api/ExamAttempts/{id}`, `/by-student/{id}`, `POST /{id}/submit`, `POST/PUT /api/ExamAnswers`, `GET /api/ExamAnswers/by-attempt/{id}` |
| Results | `GET /api/Results`, `/by-student/{id}`, `/{id}`, `POST /api/Results/generate` |

## Security notes

- The API returns a JWT in the response body, so an HttpOnly cookie is not possible without backend changes. The token is kept in `sessionStorage` (cleared when the tab closes) or, with "Keep me signed in", `localStorage`. Any script on this origin can read either, so this is not secure storage. All API data is HTML-escaped by default in templates, and the only third-party script is the pinned icon library.
- Passwords are never stored. Expired tokens and any 401 end the session and return to sign-in.
- Role checks in the browser only decide what is shown. The API remains the authority.
- Correct answers are never requested by student pages, and `isCorrect` returned by `ExamAnswers` is never displayed during an attempt.

## Backend limitations (unresolved, by design of the current API)

1. **No Exam entity.** An exam is a course's question set; a student's exam is an `ExamAttempt`. There is no exam title, duration, start/end date, publish or close, so there is **no countdown timer or publishing workflow**.
2. **`POST /ExamAttempts` and `POST /ExamAnswers` return only a Boolean.** The app finds the new attempt/answer ID by re-reading `by-student` / `by-attempt`.
3. **No search or filter parameters.** Search and filters run in the browser over loaded records (up to 1,000 per list; a note is shown if truncated). Unfiltered lists use server pagination.
4. **`QuestionDto` omits `correctAnswer`**, so editing a question requires re-selecting it.
5. **`ExamAnswerDto.isCorrect` is exposed to students** by the API. Consider removing it for in-progress attempts.
6. **Answer format is unspecified.** The app sends `"A"`–`"D"`. If your backend compares option text, set `ANSWER_FORMAT: 'text'` in `js/config.js`.
7. **No "get student by id" or "me" endpoint.** Profile uses `get-by-matric-number`; student details come from the list.
8. **`StudentCreateDto` has no password**, so admin-created students cannot sign in until they register or the backend sets one. `StudentDto` does not return `role`, so the admin edit form leaves the role unchanged unless you choose one.
9. **No refresh-token endpoint.** When the token expires the user signs in again.
10. **No GPA endpoint.** The GPA on *Academic performance* is a provisional, unofficial estimate (grade point × credit units from results) and is labelled as such.
11. **Who may call `POST /Results/generate` is undocumented.** After submitting, the app tries it and shows "result not available yet" (with *Check again*) if the server refuses. Admins can also generate results from an attempt's page.
12. **No created-date on students or courses**, so "recent registrations" and "recently created courses" are not shown. No settings or notification endpoints exist, so there is no Settings page.

## Tested against

Automated browser tests (Playwright/Chromium, 99 checks) were run against a **throwaway mock of the API written from the Swagger file**. The mock is **not part of this project** and no mock data or fake success path exists in the app. The app has **not** been tested against the real ASP.NET Core API; do a first pass with your running backend.
