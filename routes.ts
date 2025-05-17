import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertSearchHistorySchema, 
  insertUserCacheSchema,
  robloxUserSchema,
  robloxUserStatusSchema,
  robloxFriendsCountSchema,
  robloxAvatarSchema
} from "@shared/schema";
import axios from "axios";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // API Routes
  
  // Proxy route to Roblox API for user info
  app.get("/api/users/:userId", async (req, res) => {
    const userId = req.params.userId;
    
    try {
      // Check if we have a cached version
      const cachedUser = await storage.getUserCache(userId);
      if (cachedUser && 
          // Cache is valid for 1 hour
          new Date().getTime() - new Date(cachedUser.timestamp).getTime() < 3600000) {
        return res.json({
          source: "cache",
          data: cachedUser.userData,
          avatarUrl: cachedUser.avatarUrl,
          isTerminated: cachedUser.isTerminated
        });
      }
      
      // Fetch fresh data from Roblox API
      const response = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
      const userData = response.data;
      
      // Validate the user data
      const validatedData = robloxUserSchema.parse(userData);
      
      // Get avatar URL
      let avatarUrl = null;
      try {
        const avatarResponse = await axios.get(
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
        );
        const avatarData = robloxAvatarSchema.parse(avatarResponse.data);
        if (avatarData.data.length > 0) {
          avatarUrl = avatarData.data[0].imageUrl;
        }
      } catch (error) {
        console.error("Failed to fetch avatar:", error);
      }
      
      // Save to cache
      const cacheData = {
        userId,
        userData: validatedData,
        avatarUrl,
        timestamp: new Date().toISOString(),
        isTerminated: validatedData.isBanned || false
      };
      
      await storage.addUserCache(cacheData);
      
      res.json({
        source: "api",
        data: validatedData,
        avatarUrl,
        isTerminated: validatedData.isBanned || false
      });
    } catch (error: any) {
      // Special handling for terminated accounts
      // Roblox returns 400 for terminated accounts
      if (error.response && error.response.status === 400) {
        // Try to get previous username using username history API
        let previousUsernames = [];
        try {
          const usernameHistoryResponse = await axios.get(
            `https://users.roblox.com/v1/users/${userId}/username-history?limit=10&sortOrder=Asc`
          );
          previousUsernames = usernameHistoryResponse.data.data.map((item: any) => item.name);
        } catch (e) {
          console.error("Failed to fetch username history", e);
        }

        // Try to get user stats even for terminated accounts
        let userStats = {
          friends: 0,
          followers: 0,
          following: 0
        };
        
        try {
          const [friendsResponse, followersResponse, followingResponse] = await Promise.all([
            axios.get(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
            axios.get(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
            axios.get(`https://friends.roblox.com/v1/users/${userId}/followings/count`)
          ]);
          
          userStats = {
            friends: friendsResponse.data.count,
            followers: followersResponse.data.count,
            following: followingResponse.data.count
          };
        } catch (statsError) {
          console.error("Failed to fetch stats for terminated account", statsError);
        }
        
        // Try to get archived avatar URL if possible
        let archivedAvatarUrl = null;
        try {
          const avatarResponse = await axios.get(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
          );
          if (avatarResponse.data.data && avatarResponse.data.data.length > 0) {
            archivedAvatarUrl = avatarResponse.data.data[0].imageUrl;
          }
        } catch (avatarError) {
          console.error("Failed to fetch avatar for terminated account", avatarError);
        }

        const cacheData = {
          userId,
          userData: {
            id: parseInt(userId),
            name: "Terminated Account",
            displayName: "Terminated Account",
            description: "This account has been terminated for violating Roblox Terms of Service.",
            isBanned: true,
            previousUsernames: previousUsernames,
            stats: userStats
          },
          avatarUrl: archivedAvatarUrl,
          timestamp: new Date().toISOString(),
          isTerminated: true
        };
        
        await storage.addUserCache(cacheData);
        
        return res.json({
          source: "api",
          data: cacheData.userData,
          avatarUrl: archivedAvatarUrl,
          isTerminated: true,
          stats: userStats,
          previousUsernames: previousUsernames
        });
      }
      
      res.status(500).json({ 
        error: "Failed to fetch user data", 
        details: error.message 
      });
    }
  });
  
  // Get user by username
  app.post("/api/users/by-username", async (req, res) => {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }
    
    try {
      // Record search history
      await storage.addSearchHistory({
        query: username,
        type: "username",
        timestamp: new Date().toISOString(),
        success: true
      });
      
      // Call Roblox API to get user ID from username
      const response = await axios.post(
        "https://users.roblox.com/v1/usernames/users", 
        {
          usernames: [username],
          excludeBannedUsers: false
        }
      );
      
      if (response.data.data.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const userId = response.data.data[0].id.toString();
      
      res.json({
        userId
      });
    } catch (error: any) {
      // Record failed search
      await storage.addSearchHistory({
        query: username,
        type: "username",
        timestamp: new Date().toISOString(),
        success: false
      });
      
      res.status(500).json({ 
        error: "Failed to fetch user ID", 
        details: error.message 
      });
    }
  });
  
  // Get user status
  app.get("/api/users/:userId/status", async (req, res) => {
    const userId = req.params.userId;
    
    try {
      const response = await axios.get(`https://users.roblox.com/v1/users/${userId}/status`);
      const statusData = robloxUserStatusSchema.parse(response.data);
      
      res.json(statusData);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch user status", 
        details: error.message 
      });
    }
  });
  
  // Get user stats (friends, followers, following)
  app.get("/api/users/:userId/stats", async (req, res) => {
    const userId = req.params.userId;
    
    try {
      // Make parallel requests for better performance
      const [friendsResponse, followersResponse, followingResponse] = await Promise.all([
        axios.get(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
        axios.get(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
        axios.get(`https://friends.roblox.com/v1/users/${userId}/followings/count`)
      ]);
      
      const friendsData = robloxFriendsCountSchema.parse(friendsResponse.data);
      const followersData = robloxFriendsCountSchema.parse(followersResponse.data);
      const followingData = robloxFriendsCountSchema.parse(followingResponse.data);
      
      res.json({
        friends: friendsData.count,
        followers: followersData.count,
        following: followingData.count
      });
    } catch (error: any) {
      res.json({
        friends: "N/A",
        followers: "N/A",
        following: "N/A"
      });
    }
  });
  
  // Get recent searches
  app.get("/api/search-history", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const searches = await storage.getRecentSearches(limit);
      
      res.json(searches);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch search history", 
        details: error.message 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
