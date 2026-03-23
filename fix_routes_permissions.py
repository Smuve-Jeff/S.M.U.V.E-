import sys

with open('src/app/app.routes.ts', 'r') as f:
    content = f.read()

# Import guard
if 'import { authGuard }' not in content:
    content = content.replace("import { Routes } from '@angular/router';", "import { Routes } from '@angular/router';\nimport { authGuard } from './services/auth.guard';")

# Add guards and permissions
# Example: settings should require MANAGE_SETTINGS
content = content.replace("{ path: 'settings', loadComponent: () => import('./components/settings/settings.component').then(m => m.SettingsComponent) }",
                          "{ path: 'settings', loadComponent: () => import('./components/settings/settings.component').then(m => m.SettingsComponent), canActivate: [authGuard], data: { permission: 'MANAGE_SETTINGS' } }")

content = content.replace("{ path: 'analytics', loadComponent: () => import('./components/analytics-dashboard/analytics-dashboard.component').then(m => m.AnalyticsDashboardComponent) }",
                          "{ path: 'analytics', loadComponent: () => import('./components/analytics-dashboard/analytics-dashboard.component').then(m => m.AnalyticsDashboardComponent), canActivate: [authGuard], data: { permission: 'MANAGE_CATALOG' } }")

with open('src/app/app.routes.ts', 'w') as f:
    f.write(content)
