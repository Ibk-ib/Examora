import { initAuth, clearSession } from './auth.js';
import { register, setHooks, startRouter, navigate } from './router.js';
import { mount, setActive, setHeader, bindShell, resetLayout } from './layout.js';
import { toast } from './components.js';
import { invalidate } from './services.js';

import { authRoutes } from './pages/auth.js';
import { dashboardRoutes } from './pages/dashboard.js';
import { studentRoutes } from './pages/students.js';
import { courseRoutes } from './pages/courses.js';
import { enrollmentRoutes } from './pages/enrollments.js';
import { questionRoutes } from './pages/questions.js';
import { examRoutes } from './pages/exams.js';
import { examTakingRoutes } from './pages/exam-taking.js';
import { attemptRoutes } from './pages/attempts.js';
import { resultRoutes } from './pages/results.js';
import { performanceRoutes } from './pages/performance.js';
import { profileRoutes } from './pages/profile.js';

[authRoutes, dashboardRoutes, studentRoutes, courseRoutes, enrollmentRoutes, questionRoutes,
  examRoutes, examTakingRoutes, attemptRoutes, resultRoutes, performanceRoutes, profileRoutes]
  .forEach(register);

// A 401 from any authenticated request ends the session and returns to sign-in.
initAuth(() => {
  invalidate();
  resetLayout();
  toast('Your session has expired. Please sign in again.', { type: 'error' });
  navigate('/login?expired=1', { replace: true });
});

setHooks({ mount, setActive, setHeader });
bindShell();
startRouter();

// Keep `clearSession` referenced for devtools debugging: window.examora.clearSession()
window.examora = { clearSession };
