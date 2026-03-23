import sys

with open('src/app/services/user-profile.service.ts', 'r') as f:
    content = f.read()

# Update Team interface
old_team = """  team: {
    role: string;
    name: string;
    contact: string;
    active: boolean;
  }[];"""

new_team = """  team: {
    role: 'Admin' | 'Manager' | 'Collaborator' | 'Engineer' | 'Viewer';
    name: string;
    contact: string;
    active: boolean;
    permissions: string[];
  }[];"""

content = content.replace(old_team, new_team)

# Update initialProfile
old_initial_team = "  team: [],"
new_initial_team = """  team: [
    {
      role: 'Admin',
      name: 'Executive Artist',
      contact: 'internal',
      active: true,
      permissions: ['ALL_ACCESS', 'MANAGE_SETTINGS', 'MANAGE_BILLING', 'MANAGE_CATALOG', 'AI_WRITE']
    }
  ],"""

content = content.replace(old_initial_team, new_initial_team)

with open('src/app/services/user-profile.service.ts', 'w') as f:
    f.write(content)
