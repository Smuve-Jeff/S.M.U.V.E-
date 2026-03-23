import sys

with open('src/app/app.routes.ts', 'r') as f:
    content = f.read()

# Protect more routes
updates = [
    ("{ path: 'studio', loadComponent: () => import('./studio/studio.component').then(m => m.StudioComponent) }",
     "{ path: 'studio', loadComponent: () => import('./studio/studio.component').then(m => m.StudioComponent), canActivate: [authGuard], data: { permission: 'PRODUCE_MUSIC' } }"),
    ("{ path: 'business-suite', loadComponent: () => import('./components/business-suite/business-suite.component').then(m => m.BusinessSuiteComponent) }",
     "{ path: 'business-suite', loadComponent: () => import('./components/business-suite/business-suite.component').then(m => m.BusinessSuiteComponent), canActivate: [authGuard], data: { permission: 'MANAGE_BUSINESS' } }"),
    ("{ path: 'knowledge-base', loadComponent: () => import('./components/knowledge-base/knowledge-base.component').then(m => m.KnowledgeBaseComponent) }",
     "{ path: 'knowledge-base', loadComponent: () => import('./components/knowledge-base/knowledge-base.component').then(m => m.KnowledgeBaseComponent), canActivate: [authGuard], data: { permission: 'AI_STRATEGY' } }"),
    ("{ path: 'projects', loadComponent: () => import('./components/projects/projects.component').then(m => m.ProjectsComponent) }",
     "{ path: 'projects', loadComponent: () => import('./components/projects/projects.component').then(m => m.ProjectsComponent), canActivate: [authGuard], data: { permission: 'MANAGE_CATALOG' } }")
]

for old, new in updates:
    content = content.replace(old, new)

with open('src/app/app.routes.ts', 'w') as f:
    f.write(content)
