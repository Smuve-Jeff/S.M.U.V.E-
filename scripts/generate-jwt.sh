#!/usr/bin/env bash

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <client_id> <private_key_path>"
    exit 1
fi

client_id=$1
private_key_path=$2

if [[ ! -f "$private_key_path" ]]; then
    echo "Error: Private key file not found: $private_key_path"
    exit 1
fi

now=$(date +%s)
iat=$((now - 60))
exp=$((now + 600))

# Base64URL encoding function
b64enc() {
    openssl base64 -e -A | tr -d '=' | tr '/+' '_-'
}

# 1. Header
header_json='{"typ":"JWT","alg":"RS256"}'
header=$(printf '%s' "$header_json" | b64enc)

# 2. Payload
payload_json="{\"iat\":${iat},\"exp\":${exp},\"iss\":\"${client_id}\"}"
payload=$(printf '%s' "$payload_json" | b64enc)

# 3. Signature
header_payload="${header}.${payload}"

# Sign the string and encode the resulting binary signature
signature=$(printf '%s' "${header_payload}" | \
            openssl dgst -sha256 -sign "$private_key_path" | \
            b64enc)

# 4. Final JWT
jwt="${header_payload}.${signature}"

printf 'JWT: %s\n' "$jwt"
