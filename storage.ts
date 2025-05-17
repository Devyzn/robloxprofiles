import { 
  searchHistory, 
  userCache, 
  type SearchHistory, 
  type UserCache, 
  type InsertSearchHistory, 
  type InsertUserCache 
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Search history methods
  addSearchHistory(search: InsertSearchHistory): Promise<SearchHistory>;
  getRecentSearches(limit?: number): Promise<SearchHistory[]>;
  
  // User cache methods
  getUserCache(userId: string): Promise<UserCache | undefined>;
  addUserCache(cache: InsertUserCache): Promise<UserCache>;
  updateUserCache(userId: string, cache: Partial<InsertUserCache>): Promise<UserCache | undefined>;
}

export class DatabaseStorage implements IStorage {
  async addSearchHistory(search: InsertSearchHistory): Promise<SearchHistory> {
    const result = await db
      .insert(searchHistory)
      .values(search)
      .returning();
    
    return result[0];
  }

  async getRecentSearches(limit: number = 10): Promise<SearchHistory[]> {
    return await db
      .select()
      .from(searchHistory)
      .orderBy(desc(searchHistory.timestamp))
      .limit(limit);
  }

  async getUserCache(userId: string): Promise<UserCache | undefined> {
    const result = await db
      .select()
      .from(userCache)
      .where(eq(userCache.userId, userId));
    
    return result[0];
  }

  async addUserCache(cache: InsertUserCache): Promise<UserCache> {
    // Check if user already exists
    const existing = await this.getUserCache(cache.userId);
    
    if (existing) {
      return await this.updateUserCache(cache.userId, cache) as UserCache;
    }
    
    const result = await db
      .insert(userCache)
      .values(cache)
      .returning();
    
    return result[0];
  }

  async updateUserCache(userId: string, cache: Partial<InsertUserCache>): Promise<UserCache | undefined> {
    const result = await db
      .update(userCache)
      .set(cache)
      .where(eq(userCache.userId, userId))
      .returning();
    
    return result[0];
  }
}

export const storage = new DatabaseStorage();
