#!/usr/bin/env node
// manage-api-keys.js — generate and manage Game Night API keys in SSM.
//
// Keys are stored as SecureString parameters:
//   /game-night/api-keys/{apiKey}  →  userId
//
// The Lambda authorizer does a direct GetParameter lookup using the key as the
// path suffix, so one SSM call resolves a key to its owner with no scanning.
//
// Usage:
//   node scripts/manage-api-keys.js generate <userId>   — create a new key
//   node scripts/manage-api-keys.js list               — list existing keys
//   node scripts/manage-api-keys.js revoke <apiKey>    — delete a key
//   node scripts/manage-api-keys.js whoami <apiKey>    — show userId for a key
//
// Prerequisites:
//   AWS credentials configured (profile, env vars, or instance role).
//   IAM permissions needed:
//     ssm:PutParameter, ssm:GetParametersByPath, ssm:DeleteParameter,
//     ssm:GetParameter  on  arn:aws:ssm:*:*:parameter/game-night/api-keys/*

'use strict';

const { SSMClient, PutParameterCommand, GetParametersByPathCommand, DeleteParameterCommand, GetParameterCommand } = require('@aws-sdk/client-ssm');
const crypto = require('crypto');

const SSM_PREFIX = '/game-night/api-keys/';
const REGION     = process.env.AWS_REGION || 'us-east-2';
const ssm        = new SSMClient({ region: REGION });

async function generate(userId) {
  if (!userId) { console.error('Usage: generate <userId>'); process.exit(1); }

  const apiKey = crypto.randomBytes(32).toString('hex');
  const name   = `${SSM_PREFIX}${apiKey}`;

  await ssm.send(new PutParameterCommand({
    Name:      name,
    Value:     userId,
    Type:      'SecureString',
    Overwrite: false,
    Tags: [
      { Key: 'app',    Value: 'game-night' },
      { Key: 'userId', Value: userId },
    ],
  }));

  console.log('\nAPI key created successfully.');
  console.log(`  userId : ${userId}`);
  console.log(`  apiKey : ${apiKey}`);
  console.log('\nPass this as a request header:');
  console.log(`  X-API-Key: ${apiKey}`);
  console.log('\nStore it somewhere safe — it cannot be retrieved from SSM after this point.');
}

async function list() {
  const results = [];
  let nextToken;

  do {
    const res = await ssm.send(new GetParametersByPathCommand({
      Path:           SSM_PREFIX,
      WithDecryption: true,
      NextToken:      nextToken,
    }));
    for (const p of res.Parameters || []) {
      const key = p.Name.slice(SSM_PREFIX.length);
      results.push({ userId: p.Value, key: key.slice(0, 8) + '…' });
    }
    nextToken = res.NextToken;
  } while (nextToken);

  if (results.length === 0) {
    console.log('No API keys found.');
    return;
  }

  console.log(`\n${results.length} key(s) in SSM (keys truncated for display):\n`);
  console.log('  userId'.padEnd(40) + '  key prefix');
  console.log('  ' + '-'.repeat(38) + '  ' + '-'.repeat(10));
  for (const { userId, key } of results) {
    console.log(`  ${userId.padEnd(38)}  ${key}`);
  }
}

async function revoke(apiKey) {
  if (!apiKey) { console.error('Usage: revoke <apiKey>'); process.exit(1); }

  await ssm.send(new DeleteParameterCommand({ Name: `${SSM_PREFIX}${apiKey}` }));
  console.log(`Key revoked: ${apiKey.slice(0, 8)}…`);
}

async function whoami(apiKey) {
  if (!apiKey) { console.error('Usage: whoami <apiKey>'); process.exit(1); }

  const res = await ssm.send(new GetParameterCommand({
    Name:           `${SSM_PREFIX}${apiKey}`,
    WithDecryption: true,
  }));
  console.log(`userId: ${res.Parameter.Value}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const [,, command, arg] = process.argv;

const commands = { generate, list, revoke, whoami };
const fn       = commands[command];

if (!fn) {
  console.error(`Unknown command: ${command || '(none)'}`);
  console.error('Usage: manage-api-keys.js <generate|list|revoke|whoami> [arg]');
  process.exit(1);
}

fn(arg).catch(e => {
  console.error('Error:', e.message || e);
  process.exit(1);
});
