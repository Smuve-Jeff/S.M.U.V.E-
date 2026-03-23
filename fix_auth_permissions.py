import sys

with open('src/app/services/auth.service.ts', 'r') as f:
    content = f.read()

# Update AuthUser interface
old_auth_user = """export interface AuthUser {
  id: string;
  email: string;
  artistName: string;
  createdAt: Date;
  lastLogin: Date;
  profileCompleteness: number;
}"""

new_auth_user = """export interface AuthUser {
  id: string;
  email: string;
  artistName: string;
  role: 'Admin' | 'Manager' | 'Collaborator' | 'Engineer' | 'Viewer';
  permissions: string[];
  createdAt: Date;
  lastLogin: Date;
  profileCompleteness: number;
}"""

content = content.replace(old_auth_user, new_auth_user)

# Update register method
old_new_user = """      const newUser: AuthUser = {
        id: this.generateUserId(),
        email: credentials.email,
        artistName: artistName,
        createdAt: new Date(),
        lastLogin: new Date(),
        profileCompleteness: 0,
      };"""

new_new_user = """      const newUser: AuthUser = {
        id: this.generateUserId(),
        email: credentials.email,
        artistName: artistName,
        role: 'Admin',
        permissions: ['ALL_ACCESS'],
        createdAt: new Date(),
        lastLogin: new Date(),
        profileCompleteness: 0,
      };"""

content = content.replace(old_new_user, new_new_user)

with open('src/app/services/auth.service.ts', 'w') as f:
    f.write(content)
