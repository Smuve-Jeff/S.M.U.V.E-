import sys
import os

def patch_auth():
    path = 'src/app/services/auth.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Move JWT token management to TokenService
    content = "import { TokenService } from './token.service';\n" + content
    content = content.replace("private _jwtToken = signal<string | null>(null);", "")
    content = content.replace("jwtToken = this._jwtToken.asReadonly();", "private tokenService = inject(TokenService);\n  jwtToken = this.tokenService.jwtToken;")

    # Update token sets/gets
    content = content.replace("this._jwtToken.set(savedToken);", "this.tokenService.setToken(savedToken);")
    content = content.replace("this._jwtToken.set(response.token);", "this.tokenService.setToken(response.token);")
    content = content.replace("this._jwtToken.set(null);", "this.tokenService.setToken(null);")
    content = content.replace("this._jwtToken()", "this.tokenService.jwtToken()")

    # Remove direct deps on Security/Profile/LoginConfirmation if they use AuthService
    # (Actually we'll keep the injector getters for these)

    with open(path, 'w') as f:
        f.write(content)

def patch_database():
    path = 'src/app/services/database.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # DatabaseService only needs the token, so it should use TokenService
    content = "import { TokenService } from './token.service';\n" + content
    content = content.replace("import { AuthService } from './auth.service';", "")
    content = content.replace("private tokenService = inject(TokenService);", "") # Clean up if it was there

    # Insert TokenService injection
    pos = content.find("export class DatabaseService {")
    if pos != -1:
        pos = content.find("{", pos) + 1
        content = content[:pos] + "\n  private tokenService = inject(TokenService);" + content[pos:]

    # Update getHeaders
    content = content.replace("this.injector.get(AuthService, null)?.jwtToken()", "this.tokenService.jwtToken()")

    with open(path, 'w') as f:
        f.write(content)

def patch_security():
    path = 'src/app/services/security.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # SecurityService only needs the token for headers
    content = "import { TokenService } from './token.service';\n" + content
    # We still need AuthService for some checks maybe, but getHeaders can use TokenService
    pos = content.find("export class SecurityService {")
    if pos != -1:
        pos = content.find("{", pos) + 1
        content = content[:pos] + "\n  private tokenService = inject(TokenService);" + content[pos:]

    content = content.replace("this.authService?.jwtToken()", "this.tokenService.jwtToken()")

    with open(path, 'w') as f:
        f.write(content)

def patch_login_confirm():
    path = 'src/app/services/login-confirmation.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Use TokenService instead of AuthService
    content = "import { TokenService } from './token.service';\n" + content
    content = content.replace("import { AuthService } from './auth.service';", "")

    pos = content.find("export class LoginConfirmationService {")
    if pos != -1:
        pos = content.find("{", pos) + 1
        content = content[:pos] + "\n  private tokenService = inject(TokenService);" + content[pos:]

    # Updated getHeaders to use TokenService
    content = content.replace("const auth = this.injector.get(AuthService, null);", "")
    content = content.replace("const token = auth ? (auth as any).jwtToken() : null;", "const token = this.tokenService.jwtToken();")

    with open(path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    patch_auth()
    patch_database()
    patch_security()
    patch_login_confirm()
