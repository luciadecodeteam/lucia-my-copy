path "secret/data/lucia/prompts/*" {
  capabilities = ["read", "list"]
}
path "secret/data/lucia/keys/*" {
  capabilities = ["read"]
}
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
