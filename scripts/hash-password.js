#!/usr/bin/env node
import crypto from 'node:crypto';
import readline from 'node:readline';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

async function promptPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Enter password to hash: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const input = process.argv[2] || (await promptPassword());
if (!input) {
  console.error('Error: password cannot be empty.');
  process.exit(1);
}

console.log('\nAdd this line to your .env or docker-compose.yml:\n');
console.log(`AUTH_PASSWORD_HASH = "${hashPassword(input)}"\n`);
