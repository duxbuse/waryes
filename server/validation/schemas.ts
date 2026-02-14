/**
 * Zod validation schemas for API inputs
 */

import { z } from 'zod';

// Auth schemas
export const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  email: z.string().email('Invalid email address').max(255),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(64, 'Display name must be at most 64 characters')
    .regex(/^[a-zA-Z0-9\s\-_.']+$/, 'Display name can only contain letters, numbers, spaces, hyphens, underscores, periods, and apostrophes'),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// Deck schemas
export const createDeckSchema = z.object({
  name: z.string().min(1).max(128),
  divisionId: z.string().min(1).max(64),
  units: z.array(z.object({
    unitId: z.string().min(1).max(64),
    veterancy: z.number().int().min(0).max(3),
    quantity: z.number().int().min(1).max(20),
    transportId: z.string().max(64).optional(),
  })).min(1).max(30),
});

export const updateDeckSchema = createDeckSchema.partial();

export const importDecksSchema = z.object({
  decks: z.array(z.object({
    name: z.string().min(1).max(128),
    divisionId: z.string().min(1).max(64),
    units: z.array(z.object({
      unitId: z.string().min(1).max(64),
      veterancy: z.number().int().min(0).max(3),
      quantity: z.number().int().min(1).max(20),
      transportId: z.string().max(64).optional(),
    })),
  })).min(1).max(50),
});

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type CreateDeckInput = z.infer<typeof createDeckSchema>;
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;
export type ImportDecksInput = z.infer<typeof importDecksSchema>;
