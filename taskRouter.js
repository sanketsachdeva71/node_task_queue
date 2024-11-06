const express = require('express');
const Redis = require('redis');
const fs = require('fs');
const router = express.Router();

// Initialize Redis client
const client = Redis.createClient();

// Promisify Redis commands (since the async/await methods are not default in the `redis` client)
client.incrAsync = (key) => {
    return new Promise((resolve, reject) => {
        client.incr(key, (err, reply) => {
            if (err) reject(err);
            else resolve(reply);
        });
    });
};

client.expireAsync = (key, seconds) => {
    return new Promise((resolve, reject) => {
        client.expire(key, seconds, (err, reply) => {
            if (err) reject(err);
            else resolve(reply);
        });
    });
};

client.lpushAsync = (key, value) => {
    return new Promise((resolve, reject) => {
        client.lpush(key, value, (err, reply) => {
            if (err) reject(err);
            else resolve(reply);
        });
    });
};

client.lpopAsync = (key) => {
    return new Promise((resolve, reject) => {
        client.lpop(key, (err, reply) => {
            if (err) reject(err);
            else resolve(reply);
        });
    });
};

client.existsAsync = (key) => {
    return new Promise((resolve, reject) => {
        client.exists(key, (err, reply) => {
            if (err) reject(err);
            else resolve(reply);
        });
    });
};

// Rate limits
const SECOND_LIMIT = 1;   // 1 task per second
const MINUTE_LIMIT = 20;  // 20 tasks per minute

// Log file for completed tasks
const logFile = 'tasks.log';

// Rate Limiting Middleware
async function rateLimiter(req, res, next) {
    const userId = req.body.user_id;
    const secondKey = `rate:${userId}:second`;
    const minuteKey = `rate:${userId}:minute`;

    try {
        // Increment counters for per-second and per-minute limits
        const secondCount = await client.incrAsync(secondKey);
        if (secondCount === 1) await client.expireAsync(secondKey, 1); // Reset every second

        const minuteCount = await client.incrAsync(minuteKey);
        if (minuteCount === 1) await client.expireAsync(minuteKey, 60); // Reset every minute

        // Check if the limits are exceeded
        if (secondCount > SECOND_LIMIT || minuteCount > MINUTE_LIMIT) {
            await queueTask(userId, req.body.task);
            return res.status(429).json({ message: "Rate limit exceeded, task queued" });
        }

        next();
    } catch (err) {
        console.error("Rate limiter error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

// Queue a task if the rate limit is exceeded
async function queueTask(userId, task) {
    const queueKey = `queue:${userId}`;
    await client.lpushAsync(queueKey, JSON.stringify(task));
}

// Process queued tasks for each user
async function processQueue(userId) {
    const queueKey = `queue:${userId}`;
    const task = await client.lpopAsync(queueKey);
    if (task) {
        // Process the task and log it
        await processTask(userId, JSON.parse(task));
        
        // Schedule the next task after 1 second
        setTimeout(() => processQueue(userId), 1000);
    }
}

// Main task processing function
async function processTask(userId, task) {
    const timestamp = Date.now();
    const logEntry = `${userId} - task completed at - ${timestamp}\n`;
    fs.appendFile(logFile, logEntry, (err) => {
        if (err) console.error("Error logging task:", err);
    });
    console.log(`Processing task for user ${userId}: ${task}`);
}

// Route handler
router.post('/', rateLimiter, async (req, res) => {
    const userId = req.body.user_id;
    const task = req.body.task;

    // Log and process the task immediately if within rate limits
    await processTask(userId, task);
    res.status(200).json({ message: 'Task processed' });

    // Start processing any queued tasks for the user
    if (await client.existsAsync(`queue:${userId}`)) {
        processQueue(userId);
    }
});

module.exports = router;
