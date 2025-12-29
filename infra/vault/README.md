# Vault Setup (Client runs)
vault policy write lucia-backend policy-backend.hcl
vault auth enable approle
vault write auth/approle/role/lucia-backend token_policies="lucia-backend" secret_id_ttl=3600 token_ttl=3600 token_max_ttl=7200
vault read auth/approle/role/lucia-backend/role-id
vault write -f auth/approle/role/lucia-backend/secret-id
