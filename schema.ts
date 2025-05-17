import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User search history
export const searchHistory = pgTable("search_history", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  type: text("type").notNull(), // 'username' or 'userid'
  timestamp: text("timestamp").notNull(), // ISO date string
  success: boolean("success").notNull().default(true),
});

export const insertSearchHistorySchema = createInsertSchema(searchHistory).omit({
  id: true,
});

// Cache for Roblox user data to reduce API calls
export const userCache = pgTable("user_cache", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  userData: jsonb("user_data").notNull(),
  avatarUrl: text("avatar_url"),
  timestamp: text("timestamp").notNull(), // ISO date string
  isTerminated: boolean("is_terminated").default(false),
});

export const insertUserCacheSchema = createInsertSchema(userCache).omit({
  id: true,
});

// Type definitions
export type InsertSearchHistory = z.infer<typeof insertSearchHistorySchema>;
export type SearchHistory = typeof searchHistory.$inferSelect;

export type InsertUserCache = z.infer<typeof insertUserCacheSchema>;
export type UserCache = typeof userCache.$inferSelect;

// Zod schemas for Roblox API response validation
export const robloxUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional().default(""),
  created: z.string().optional(),
  isBanned: z.boolean().optional().default(false),
  externalAppDisplayName: z.string().nullable().optional(),
  hasVerifiedBadge: z.boolean().optional().default(false),
  previousUsernames: z.array(z.string()).optional(),
  stats: z.object({
    friends: z.number(),
    followers: z.number(),
    following: z.number()
  }).optional(),
});

export const robloxUserStatusSchema = z.object({
  status: z.string(),
});

export const robloxFriendsCountSchema = z.object({
  count: z.number(),
});

export const robloxAvatarSchema = z.object({
  data: z.array(
    z.object({
      targetId: z.number().optional(),
      state: z.string().optional(),
      imageUrl: z.string(),
    })
  ),
});

export type RobloxUser = z.infer<typeof robloxUserSchema>;
export type RobloxUserStatus = z.infer<typeof robloxUserStatusSchema>;
export type RobloxFriendsCount = z.infer<typeof robloxFriendsCountSchema>;
export type RobloxAvatar = z.infer<typeof robloxAvatarSchema>;
