/**
 * Email Migration Utilities
 * 
 * Helper functions for the email migration flow, including:
 * - Extracting Discord profile data from user metadata
 * - Pre-filling email in the migration form
 * - Normalizing Discord usernames
 */

import { User } from "@supabase/supabase-js";

/**
 * Extract Discord-related metadata from Supabase user
 * 
 * @param user - Supabase User object from oauth login
 * @returns Object with discord username, user ID, and avatar
 * 
 * @example
 * ```tsx
 * const { discordUsername, discordUserId, discordAvatar } = getDiscordProfile(user);
 * ```
 */
export interface DiscordProfile {
  discordUsername: string;
  discordUserId: string | null;
  discordAvatar: string | null;
}

export function getDiscordProfile(user: User | null): DiscordProfile {
  if (!user) {
    return {
      discordUsername: "",
      discordUserId: null,
      discordAvatar: null,
    };
  }

  const metadata = user.user_metadata || {};

  return {
    // Discord username can be in different fields depending on provider
    discordUsername: metadata.preferred_username || metadata.name || user.email?.split("@")[0] || "",
    
    // Discord user ID (provider_id is set by Supabase for OAuth)
    discordUserId: metadata.provider_id || null,
    
    // Discord avatar URL
    discordAvatar: metadata.avatar_url || null,
  };
}

/**
 * Get the primary email address associated with a Supabase user
 * Falls back to generated email for OAuth-only users
 * 
 * @param user - Supabase User object
 * @returns Email address or null
 * 
 * @example
 * ```tsx
 * const email = getUserEmail(user);
 * setEmail(email || ""); // Pre-fill form
 * ```
 */
export function getUserEmail(user: User | null): string | null {
  if (!user) return null;

  const metadata = user.user_metadata || {};

  // Try email field first (standard)
  if (user.email) return user.email;

  // Try metadata email (some OAuth providers)
  if (typeof metadata.email === "string") return metadata.email;

  // Fallback: generate from Discord username
  const { discordUsername } = getDiscordProfile(user);
  if (discordUsername) {
    return `${discordUsername}@discord.local`;
  }

  return null;
}

/**
 * Normalize Discord username for database storage
 * 
 * Rules:
 * - Remove leading @ symbols
 * - Lowercase
 * - Trim whitespace
 * - Remove special characters (keep only alphanumeric, underscore, dash)
 * 
 * @param username - Raw Discord username
 * @returns Normalized username
 * 
 * @example
 * ```tsx
 * const normalized = normalizeDiscordUsername("@MyDiscordUser#1234");
 * // Returns: "mydiscorduser1234"
 * ```
 */
export function normalizeDiscordUsername(username: string): string {
  if (!username) return "";

  return username
    .toLowerCase()
    .trim()
    .replace(/^@+/, "") // Remove leading @
    .replace(/[^a-z0-9_-]/g, "") // Keep only alphanumeric, underscore, dash
    .substring(0, 32); // Discord username max length
}

/**
 * Validate email format for migration form
 * 
 * @param email - Email to validate
 * @returns Object with isValid and error message
 * 
 * @example
 * ```tsx
 * const { isValid, error } = validateEmailForMigration(email);
 * if (!isValid) toast.error(error);
 * ```
 */
export interface EmailValidation {
  isValid: boolean;
  error: string | null;
}

export function validateEmailForMigration(email: string): EmailValidation {
  if (!email.trim()) {
    return { isValid: false, error: "Email is required" };
  }

  // Simple regex for email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return { isValid: false, error: "Please enter a valid email address" };
  }

  // Reject disposable email domains (optional security measure)
  const disposableDomains = [
    "tempmail.com",
    "guerrillamail.com",
    "mailinator.com",
    "10minutemail.com",
    "throwaway.email",
  ];

  const domain = email.split("@")[1]?.toLowerCase();
  if (disposableDomains.includes(domain)) {
    return { isValid: false, error: "Please use a real email address" };
  }

  return { isValid: true, error: null };
}

/**
 * Validate password strength for migration form
 * 
 * @param password - Password to validate
 * @returns Object with isValid, message, and strength score (0-4)
 * 
 * @example
 * ```tsx
 * const { isValid, message, score } = validatePassword(password);
 * ```
 */
export interface PasswordValidation {
  isValid: boolean;
  message: string;
  score: number; // 0-4
}

export function validatePassword(password: string): PasswordValidation {
  let score = 0;
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("At least 8 characters");
  } else {
    score++;
  }

  if (password.length < 12) {
    errors.push("12+ characters recommended");
  } else {
    score++;
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Lowercase letter");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Uppercase letter");
  } else if (/[a-z]/.test(password)) {
    score++;
  }

  if (!/\d/.test(password)) {
    errors.push("Number");
  } else {
    score++;
  }

  if (!/[^a-zA-Z\d]/.test(password)) {
    errors.push("Special character (!@#$%^&*)");
  } else {
    score++;
  }

  return {
    isValid: score >= 2, // At least 8 chars + 1 complexity rule
    message: errors.length > 0 ? `Missing: ${errors.join(", ")}` : "Strong password",
    score: Math.min(score, 4),
  };
}

/**
 * Check if user is coming from Discord OAuth flow
 * 
 * @param user - Supabase User object
 * @returns True if user was created via Discord OAuth
 * 
 * @example
 * ```tsx
 * if (isDiscordOAuthUser(user)) {
 *   // Show Discord-specific UI
 * }
 * ```
 */
export function isDiscordOAuthUser(user: User | null): boolean {
  if (!user) return false;

  const metadata = user.user_metadata || {};

  // Check if Discord provider data exists
  return (
    !!metadata.preferred_username || // Discord username
    !!metadata.provider_id || // Discord user ID
    user.app_metadata?.providers?.includes("discord") ||
    false
  );
}

/**
 * Format error message from Supabase auth error
 * 
 * @param error - Error from Supabase
 * @returns User-friendly error message
 * 
 * @example
 * ```tsx
 * if (error) {
 *   toast.error(formatAuthError(error));
 * }
 * ```
 */
export function formatAuthError(error: any): string {
  if (!error) return "An unexpected error occurred";

  const message = error.message || String(error);

  // Map common Supabase errors to friendly messages
  const errorMap: Record<string, string> = {
    "Invalid login credentials": "Email or password is incorrect",
    "User already registered": "This email is already in use",
    "Email not confirmed": "Please confirm your email before signing in",
    "Token expired": "Your recovery link has expired. Please request a new one.",
    "Same password": "New password must be different from current password",
    "Password should be different": "New password must be different from current password",
  };

  for (const [key, value] of Object.entries(errorMap)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  return message;
}

/**
 * Create pre-filled email field value from user
 * Used to intelligently suggest email in migration form
 * 
 * @param user - Supabase User object
 * @param fallback - Default value if no email found
 * @returns Email to pre-fill
 * 
 * @example
 * ```tsx
 * const [email, setEmail] = useState(getPrefillEmail(user));
 * ```
 */
export function getPrefillEmail(user: User | null, fallback: string = ""): string {
  if (!user) return fallback;

  // Primary: user.email (from password auth or provider)
  if (user.email) return user.email;

  // Secondary: metadata.email (some OAuth providers)
  if (user.user_metadata?.email) return user.user_metadata.email;

  // Fallback: generate from Discord username
  const { discordUsername } = getDiscordProfile(user);
  if (discordUsername) {
    // Don't return a generated email - ask user to provide theirs
    return fallback;
  }

  return fallback;
}

/**
 * Check if email matches user's known email addresses
 * Helpful for verification in migration flow
 * 
 * @param user - Supabase User object
 * @param email - Email to check
 * @returns True if email matches any known email for user
 * 
 * @example
 * ```tsx
 * if (!isEmailForUser(user, email)) {
 *   toast.warn("This email doesn't match your Discord account");
 * }
 * ```
 */
export function isEmailForUser(user: User | null, email: string): boolean {
  if (!user) return false;

  const knownEmails = [
    user.email,
    user.user_metadata?.email,
  ].filter(Boolean);

  return knownEmails.some(
    (known) => known?.toLowerCase() === email.toLowerCase()
  );
}
