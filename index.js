const express = require('express');
const cluster = require('cluster');
const os = require('os');
const taskRouter = require('./taskRouter');
const Redis = require('redis');

// Number of CPU cores
const numCPUs = os.cpus().length;

const app = express();
const client = Redis.createClient(); // Redis client to interact with Redis server

app.use(express.json());  // Middleware to parse JSON requests

// Initialize taskRouter
app.use('/tasks', taskRouter);

// Rate limit constants
const MAX_TASKS_PER_SECOND = 1;
const MAX_TASKS_PER_MINUTE = 20;

// Rate-limiting and queueing logic
function canProceedWithTask(user_id, callback) {
    const currentTime = Date.now();
    
    // Check if the user has tasks in Redis
    client.lrange(`user:${user_id}:tasks`, 0, -1, (err, taskHistory) => {
        if (err) {
            return callback(err, false);
        }

        // Convert task history from strings to integers (timestamps)
        taskHistory = taskHistory.map(ts => parseInt(ts));

        // Remove tasks older than 1 minute (rate limit per minute)
        taskHistory = taskHistory.filter(ts => currentTime - ts < 60000);

        // Check if task limit exceeded for minute
        if (taskHistory.length >= MAX_TASKS_PER_MINUTE) {
            return callback(null, false); // Rate limit exceeded for minute
        }

        // Check if task limit exceeded for second
        const lastTaskTime = taskHistory.length ? taskHistory[taskHistory.length - 1] : 0;
        if (currentTime - lastTaskTime < 1000) {
            return callback(null, false); // Rate limit exceeded for second
        }

        // Proceed with task if within limits
        taskHistory.push(currentTime); // Add current task time to history
        client.lpush(`user:${user_id}:tasks`, currentTime); // Save task timestamp to Redis
        callback(null, true); // Task can proceed
    });
}

function queueTask(user_id) {
    // Queue the task for later processing if rate limit exceeded
    client.rpush('taskQueue', user_id);
    setTimeout(() => processTask(user_id), 1000); // Process task after 1 second delay
}

function processTask(user_id) {
    console.log(`Processing task for user ${user_id} at ${Date.now()}`);
    task(user_id); // Log the task completion
}

// Task function - log the task completion and user ID
async function task(user_id) {
    const logMessage = `${user_id}-task completed at-${Date.now()}`;
    console.log(logMessage);
    taskLogger(logMessage); // Log to file
}

// Fork workers for clustering
if (cluster.isMaster) {
    // Fork workers for each CPU core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });
} else {
    // Worker process to handle requests
    app.listen(3000, () => {
        console.log(`Worker ${process.pid} started and listening on port 3000`);
    });
}
