import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email(),
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/, 'Username may only contain letters, numbers, underscore and dot'),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1),
    password: z.string().min(1),
    totpCode: z.string().optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const forgotPasswordSchema = z.object({
  body: z.object({ email: z.string().email() }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(10),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const createFolderSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
    parentId: z.string().uuid().nullable().optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const shareFileSchema = z.object({
  body: z.object({
    expiresInHours: z.number().int().positive().max(24 * 365).optional(),
    maxDownloads: z.number().int().positive().optional(),
    downloadPolicy: z.enum(['ALLOWED', 'BLOCKED']).optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().uuid() }),
});

// ------------------------------------------------------------------
// VAULT MODE
// ------------------------------------------------------------------

/** Same shape as password.ts's runtime strength check; kept in sync manually
 *  since Zod's regex-only validation can't easily share that helper. */
const vaultPasswordSchema = z
  .string()
  .min(8, 'Vault password must be at least 8 characters long')
  .regex(/[A-Z]/, 'Vault password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Vault password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Vault password must contain at least one number');

export const vaultSetupSchema = z.object({
  body: z.object({
    vaultPassword: vaultPasswordSchema,
    confirmVaultPassword: z.string().min(8),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const vaultUnlockSchema = z.object({
  body: z.object({ vaultPassword: z.string().min(1) }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const vaultRecoveryUnlockSchema = z.object({
  body: z.object({ recoveryCode: z.string().min(1) }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const vaultResetPasswordSchema = z.object({
  body: z.object({
    newVaultPassword: vaultPasswordSchema,
    confirmVaultPassword: z.string().min(8),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});
