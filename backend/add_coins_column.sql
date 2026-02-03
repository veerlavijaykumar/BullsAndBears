-- Add coins column to hackathon_appusermember table
-- This script adds the coins field with a default value of 100

ALTER TABLE hackathon_appusermember 
ADD COLUMN coins INT NOT NULL DEFAULT 100 
AFTER phone;

-- Update existing users to have 100 coins
UPDATE hackathon_appusermember 
SET coins = 100 
WHERE coins IS NULL OR coins = 0;

-- Verify the column was added
SELECT * FROM hackathon_appusermember LIMIT 5;
