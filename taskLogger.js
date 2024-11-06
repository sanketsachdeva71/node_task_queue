const fs = require('fs');
const logFile = 'tasks.log';

function logTaskCompletion(userId, task) {
    const timestamp = Date.now();
    const logEntry = `${userId} - task completed at ${timestamp} - Task: ${JSON.stringify(task)}\n`;
    fs.appendFile(logFile, logEntry, (err) => {
        if (err) console.error("Error logging task:", err);
    });
}

module.exports = logTaskCompletion;
