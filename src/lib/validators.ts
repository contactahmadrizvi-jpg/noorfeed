/** Centralised validation rules — used across all forms */

// ── Email ────────────────────────────────────────────────────────────────────
export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required.";
  // RFC 5322 simplified pattern
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return "Enter a valid email address.";
  return null;
}

// ── Password ─────────────────────────────────────────────────────────────────
export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4; // 0=very weak … 4=strong
  label: string;
  color: string; // tailwind text colour
  barColor: string; // tailwind bg colour
  tips: string[];
}

export function getPasswordStrength(password: string): PasswordStrength {
  const tips: string[] = [];
  let score = 0;

  if (password.length >= 8) score++;
  else tips.push("Use at least 8 characters");

  if (password.length >= 12) score++;
  else if (password.length >= 8) tips.push("12+ characters is stronger");

  if (/[A-Z]/.test(password)) score++;
  else tips.push("Add uppercase letters");

  if (/[0-9]/.test(password)) score++;
  else tips.push("Add numbers");

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else tips.push("Add special characters (!@#$…)");

  // Cap at 4
  const capped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;

  const labels: Record<0 | 1 | 2 | 3 | 4, string> = {
    0: "Very weak",
    1: "Weak",
    2: "Fair",
    3: "Good",
    4: "Strong",
  };
  const colors: Record<0 | 1 | 2 | 3 | 4, string> = {
    0: "text-red-500",
    1: "text-orange-500",
    2: "text-yellow-500",
    3: "text-emerald-500",
    4: "text-emerald-600",
  };
  const barColors: Record<0 | 1 | 2 | 3 | 4, string> = {
    0: "bg-red-400",
    1: "bg-orange-400",
    2: "bg-yellow-400",
    3: "bg-emerald-400",
    4: "bg-emerald-500",
  };

  return {
    score: capped,
    label: labels[capped],
    color: colors[capped],
    barColor: barColors[capped],
    tips,
  };
}

export function validatePassword(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  return null;
}

export function validatePasswordStrong(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Include at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Include at least one number.";
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return "Please confirm your password.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

// ── Username ──────────────────────────────────────────────────────────────────
export function validateUsername(username: string): string | null {
  const clean = username.toLowerCase().trim();
  if (!clean) return "Username is required.";
  if (clean.length < 3) return "Username must be at least 3 characters.";
  if (clean.length > 20) return "Username must be 20 characters or fewer.";
  if (!/^[a-z0-9_]+$/.test(clean)) return "Only lowercase letters, numbers, and underscores.";
  if (/^_|_$/.test(clean)) return "Username cannot start or end with an underscore.";
  if (/__/.test(clean)) return "Username cannot have consecutive underscores.";
  // Block common spam/impersonation patterns
  const blocked = ["admin", "noor", "noorfeed", "support", "help", "moderator", "mod"];
  if (blocked.includes(clean)) return `"${clean}" is a reserved username.`;
  return null;
}

// ── Display name ──────────────────────────────────────────────────────────────
export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Display name is required.";
  if (trimmed.length < 2) return "Display name must be at least 2 characters.";
  if (trimmed.length > 50) return "Display name must be 50 characters or fewer.";
  if (/[<>{}[\]\\]/.test(trimmed)) return "Display name contains invalid characters.";
  return null;
}

// ── Bio ───────────────────────────────────────────────────────────────────────
export function validateBio(bio: string): string | null {
  if (bio.length > 200) return "Bio must be 200 characters or fewer.";
  return null;
}

// ── Post title ────────────────────────────────────────────────────────────────
export function validatePostTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "Title is required.";
  if (trimmed.length < 3) return "Title must be at least 3 characters.";
  if (trimmed.length > 100) return "Title must be 100 characters or fewer.";
  if (/[<>{}[\]\\]/.test(trimmed)) return "Title contains invalid characters.";
  return null;
}

// ── Post caption ──────────────────────────────────────────────────────────────
export function validateCaption(caption: string): string | null {
  if (caption.length > 1000) return "Caption must be 1,000 characters or fewer.";
  return null;
}

// ── File ──────────────────────────────────────────────────────────────────────
const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 100;

export function validateMediaFile(file: File): string | null {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    return "Only images and videos are allowed.";
  }

  const sizeMB = file.size / (1024 * 1024);

  if (isImage && sizeMB > MAX_IMAGE_MB) {
    return `Image must be under ${MAX_IMAGE_MB} MB. Yours is ${sizeMB.toFixed(1)} MB.`;
  }
  if (isVideo && sizeMB > MAX_VIDEO_MB) {
    return `Video must be under ${MAX_VIDEO_MB} MB. Yours is ${sizeMB.toFixed(1)} MB.`;
  }

  const allowedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const allowedVideoTypes = ["video/mp4", "video/mov", "video/quicktime", "video/webm"];

  if (isImage && !allowedImageTypes.includes(file.type)) {
    return "Supported image formats: JPG, PNG, GIF, WebP.";
  }
  if (isVideo && !allowedVideoTypes.includes(file.type)) {
    return "Supported video formats: MP4, MOV, WebM.";
  }

  return null;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
export function validateAvatarFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Avatar must be an image.";
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > 5) return `Avatar must be under 5 MB. Yours is ${sizeMB.toFixed(1)} MB.`;
  return null;
}

// ── Comment ───────────────────────────────────────────────────────────────────
export function validateComment(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "Comment cannot be empty.";
  if (trimmed.length > 500) return "Comment must be 500 characters or fewer.";
  return null;
}
