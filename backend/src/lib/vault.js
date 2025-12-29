const axios = require('axios');

async function getToken() {
  if (process.env.VAULT_DEV_TOKEN) return process.env.VAULT_DEV_TOKEN;
  if (!process.env.VAULT_ADDR || !process.env.VAULT_ROLE_ID || !process.env.VAULT_SECRET_ID) {
    throw new Error('Vault not configured');
  }
  const { data } = await axios.post(`${process.env.VAULT_ADDR}/v1/auth/approle/login`, {
    role_id: process.env.VAULT_ROLE_ID,
    secret_id: process.env.VAULT_SECRET_ID,
  });
  return data.auth.client_token;
}

async function readKv2(path) {
  const token = await getToken();
  const url = `${process.env.VAULT_ADDR}/v1/secret/data/${path}`;
  const { data } = await axios.get(url, { headers: { 'X-Vault-Token': token } });
  return data.data.data;
}

module.exports = { readKv2 };
