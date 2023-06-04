# Generate a 32-byte (256-bit) random string for the encryption key
ENCRYPTION_KEY=$(openssl rand -base64 32)

# Generate a 64-byte (512-bit) random string for the signing key
SIGNING_KEY=$(openssl rand -base64 64)

# Print the keys
echo "Encryption Key: $ENCRYPTION_KEY"
echo "Signing Key: $SIGNING_KEY"
