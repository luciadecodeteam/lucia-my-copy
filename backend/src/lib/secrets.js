const cache = new Map();

async function loadSecretsManagerClient() {
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.LUCIA_AWS_REGION || 'eu-west-1';
    return { SecretsManagerClient, GetSecretValueCommand, region };
  } catch (err) {
    const hint = 'Install @aws-sdk/client-secrets-manager to enable secret retrieval';
    const e = new Error(`${hint}: ${err.message}`);
    e.cause = err;
    e.code = 'secrets_manager_unavailable';
    throw e;
  }
}

async function getSecretValue(secretId) {
  if (!secretId) {
    throw new Error('Secret identifier is required');
  }
  if (cache.has(secretId)) {
    return cache.get(secretId);
  }
  const { SecretsManagerClient, GetSecretValueCommand, region } = await loadSecretsManagerClient();
  const client = new SecretsManagerClient({ region });
  const command = new GetSecretValueCommand({ SecretId: secretId });
  const data = await client.send(command);
  let secret = data.SecretString;
  if (!secret && data.SecretBinary) {
    secret = Buffer.from(data.SecretBinary, 'base64').toString('utf-8');
  }
  cache.set(secretId, secret);
  return secret;
}

function parseSecretValue(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

module.exports = {
  getSecretValue,
  parseSecretValue,
};
