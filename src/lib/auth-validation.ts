export const MIN_PASSWORD_LENGTH = 6;

export interface NewPasswordErrors {
  password?: string;
  confirmPassword?: string;
}

/**
 * Pure validation for the set-new-password form. Mirrors SignUpForm's inline
 * rules (min length + confirm match) so the client form and the server endpoint
 * enforce the same contract. Returns an empty object when the input is valid.
 */
export function validateNewPassword(password: string, confirmPassword: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {};

  if (!password) {
    errors.password = "Password is required";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Please confirm your password";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  return errors;
}
