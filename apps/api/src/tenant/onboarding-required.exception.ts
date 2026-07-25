import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A verified user with no workspace yet — no active Clerk org AND no personal
 * tenant. Not an error, a state: the frontend catches this code and shows the
 * personal-vs-company choice. 403 (authenticated, but not yet entitled).
 */
export class OnboardingRequiredException extends HttpException {
  constructor() {
    super({ statusCode: HttpStatus.FORBIDDEN, error: 'Forbidden', code: 'ONBOARDING_REQUIRED' }, HttpStatus.FORBIDDEN);
  }
}
