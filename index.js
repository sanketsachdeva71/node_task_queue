const express = require('express');
const cluster = require('cluster');
const os = require('os');
const taskRouter = require('./taskRouter');
const Redis = require('redis');

// Number of CPU cores
const numCPUs = os.cpus().length;

const app = express();
const client = Redis.createClient();

app.use(express.json());  // Middleware to parse JSON requests

// Initialize taskRouter
app.use('/tasks', taskRouter);

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
