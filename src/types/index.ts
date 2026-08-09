/**
 * Shared authentication shape used across the backend:
 *   - the socket.io handshake (validate JWT, look up socket's userId)
 *   - the express `authenticate` middleware
 *   - the social + studio services that key by userId
 *
 * This is a deliberately *narrow* shape — anything the REST or socket
 * surface needs beyond userId/role should be loaded off the User entity
 * lazily, never broadened into AuthUser.
 */
export interface AuthUser {
  userId: number;
  role: string;
}
