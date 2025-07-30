-- LinkedIn Bot Database Schema
-- Creates all necessary tables for the LinkedIn Thought Leadership Bot

-- Profiles table for LinkedIn connections and leads
CREATE TABLE IF NOT EXISTS linkedin_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT,
    title TEXT,
    company TEXT,
    industry TEXT,
    profile_url TEXT,
    connection_date DATETIME,
    lead_score INTEGER DEFAULT 0,
    last_interaction DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Content posts table for tracking published content
CREATE TABLE IF NOT EXISTS content_posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    post_date DATETIME NOT NULL,
    platform_post_id TEXT,
    post_type TEXT DEFAULT 'text', -- text, image, video, document
    impressions INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    roi_attributed DECIMAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Connection requests tracking
CREATE TABLE IF NOT EXISTS connection_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    target_profile_id TEXT NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending', -- pending, accepted, declined, withdrawn
    sent_date DATETIME NOT NULL,
    response_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Direct message campaigns
CREATE TABLE IF NOT EXISTS dm_campaigns (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    recipient_profile_id TEXT NOT NULL,
    campaign_name TEXT,
    message_sequence TEXT, -- JSON array of messages
    current_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active', -- active, paused, completed, failed
    last_sent DATETIME,
    next_send DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Daily analytics table
CREATE TABLE IF NOT EXISTS analytics_daily (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date DATE NOT NULL,
    posts_published INTEGER DEFAULT 0,
    comments_made INTEGER DEFAULT 0,
    likes_given INTEGER DEFAULT 0,
    connections_sent INTEGER DEFAULT 0,
    connections_accepted INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    profile_views INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    roi_attributed DECIMAL DEFAULT 0,
    UNIQUE(user_id, date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON linkedin_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_lead_score ON linkedin_profiles(lead_score);
CREATE INDEX IF NOT EXISTS idx_posts_user_date ON content_posts(user_id, post_date);
CREATE INDEX IF NOT EXISTS idx_connections_user_status ON connection_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_analytics_user_date ON analytics_daily(user_id, date);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON dm_campaigns(status, next_send);