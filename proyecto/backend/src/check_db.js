const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../data.sqlite'));

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables in DB:', tables.map(t => t.name).join(', '));

const sessionsSchema = db.prepare("PRAGMA table_info(chat_sessions)").all();
console.log('chat_sessions schema:', JSON.stringify(sessionsSchema, null, 2));

const messagesSchema = db.prepare("PRAGMA table_info(chat_messages)").all();
console.log('chat_messages schema:', JSON.stringify(messagesSchema, null, 2));
